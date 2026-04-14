const os = require('os');
const path = require('path');

const { calculateSessionCost } = require('../domain/pricing');
const { discoverSessionFiles } = require('../ingest/discoverSessionFiles');
const { readJsonlEntries } = require('../ingest/readJsonlEntries');

const ACTIVE_THRESHOLD_SEC = 120;
const IDLE_GAP_SEC = 120;

function extractFirstUserText(content) {
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block && block.type === 'text' && block.text) {
        return block.text.slice(0, 80);
      }
    }
    return '';
  }

  if (typeof content === 'string') {
    return content.slice(0, 80);
  }

  return '';
}

function buildProjectName(sessionPath, homeDir) {
  const projectDirName = path.basename(path.dirname(sessionPath));
  const homeEscaped = homeDir.replace(/\//g, '-').replace(/^-/, '');
  return projectDirName.replace(`-${homeEscaped}-`, '~/').replace(/-/g, '/');
}

function buildCumulativeTimeline(timeline) {
  const cumulativeTimeline = [];
  let cumulative = 0;
  const step = Math.max(1, Math.floor(timeline.length / 200));

  for (let i = 0; i < timeline.length; i++) {
    cumulative += timeline[i].tokens;
    if (i % step === 0 || i === timeline.length - 1) {
      cumulativeTimeline.push({
        ts: timeline[i].ts,
        cumulative,
        context: timeline[i].cache_read || 0,
        agent: timeline[i].agent,
      });
    }
  }

  return cumulativeTimeline;
}

function calculateActivityMetrics(firstTs, lastTs, timeline, totalTokens, activeThresholdSec) {
  let durationSec = 0;
  let activeSec = 0;
  let burnRate = 0;
  let recentBurnRate = 0;
  let isActive = false;

  if (!firstTs || !lastTs) {
    return { durationSec, activeSec, burnRate, recentBurnRate, isActive };
  }

  try {
    const firstMs = new Date(firstTs).getTime();
    const lastMs = new Date(lastTs).getTime();
    const nowMs = Date.now();

    durationSec = Math.max((lastMs - firstMs) / 1000, 1);

    for (let i = 1; i < timeline.length; i++) {
      const prev = new Date(timeline[i - 1].ts).getTime();
      const current = new Date(timeline[i].ts).getTime();
      const gap = (current - prev) / 1000;
      if (gap <= IDLE_GAP_SEC) {
        activeSec += gap;
      }
    }
    activeSec = Math.max(activeSec, 1);
    burnRate = totalTokens / (activeSec / 60);

    isActive = (nowMs - lastMs) / 1000 < activeThresholdSec;
    if (isActive) {
      const recentCutoff = new Date(nowMs - 3 * 60 * 1000).toISOString();
      let recentTokens = 0;
      let recentFirst = null;

      for (const entry of timeline) {
        if (entry.ts >= recentCutoff) {
          recentTokens += entry.tokens;
          if (!recentFirst) recentFirst = entry.ts;
        }
      }

      if (recentFirst) {
        const recentDurationMin = Math.max((nowMs - new Date(recentFirst).getTime()) / 1000 / 60, 0.1);
        recentBurnRate = recentTokens / recentDurationMin;
      }
    }
  } catch {}

  return { durationSec, activeSec, burnRate, recentBurnRate, isActive };
}

function buildSessionAggregate(sessionPath, options = {}) {
  const { windowStartISO = null, activeThresholdSec = ACTIVE_THRESHOLD_SEC, homeDir = os.homedir() } = options;
  const sessionId = path.basename(sessionPath, '.jsonl');
  const files = discoverSessionFiles(sessionPath);

  let totalIn = 0;
  let totalOut = 0;
  let cacheRead = 0;
  let cacheCreate = 0;
  let msgCount = 0;
  let userMsgCount = 0;
  let windowTokens = 0;
  let firstTs = null;
  let lastTs = null;
  let model = '';
  let firstUserMsg = '';

  const subagentStats = {};
  const modelStats = {};
  const timeline = [];

  for (const file of files) {
    const agentName = file.name;
    if (!subagentStats[agentName]) {
      subagentStats[agentName] = {
        input: 0,
        output: 0,
        cache_read: 0,
        cache_create: 0,
        total: 0,
        messages: 0,
        model: '',
      };
    }

    for (const entry of readJsonlEntries(file.path)) {
      const ts = entry.timestamp || '';
      if (ts) {
        if (!firstTs || ts < firstTs) firstTs = ts;
        if (!lastTs || ts > lastTs) lastTs = ts;
      }

      const msg = entry.message || {};
      if (!file.isSubagent && msg.role === 'user') {
        userMsgCount++;
        if (!firstUserMsg) {
          firstUserMsg = extractFirstUserText(msg.content);
        }
      }

      const usage = msg.usage;
      if (!usage) continue;

      const inputTokens = usage.input_tokens || 0;
      const outputTokens = usage.output_tokens || 0;
      const cacheReadTokens = usage.cache_read_input_tokens || 0;
      const cacheCreateTokens = usage.cache_creation_input_tokens || 0;
      const totalTokensForMessage = inputTokens + outputTokens + cacheReadTokens + cacheCreateTokens;
      const entryModel = msg.model || '';

      if (entryModel) {
        model = entryModel;
        if (!subagentStats[agentName].model) subagentStats[agentName].model = entryModel;
      }

      const modelKey = entryModel || 'unknown';
      if (!modelStats[modelKey]) {
        modelStats[modelKey] = { input: 0, output: 0, cache_read: 0, cache_create: 0 };
      }
      modelStats[modelKey].input += inputTokens;
      modelStats[modelKey].output += outputTokens;
      modelStats[modelKey].cache_read += cacheReadTokens;
      modelStats[modelKey].cache_create += cacheCreateTokens;

      totalIn += inputTokens;
      totalOut += outputTokens;
      cacheRead += cacheReadTokens;
      cacheCreate += cacheCreateTokens;
      msgCount++;

      if (windowStartISO && ts && ts >= windowStartISO) {
        windowTokens += totalTokensForMessage;
      }

      const stats = subagentStats[agentName];
      stats.input += inputTokens;
      stats.output += outputTokens;
      stats.cache_read += cacheReadTokens;
      stats.cache_create += cacheCreateTokens;
      stats.total += totalTokensForMessage;
      stats.messages++;

      if (ts) {
        timeline.push({ ts, tokens: totalTokensForMessage, cache_read: cacheReadTokens, agent: agentName });
      }
    }
  }

  timeline.sort((a, b) => (a.ts > b.ts ? 1 : -1));

  const totalTokens = totalIn + totalOut + cacheRead + cacheCreate;
  const { durationSec, activeSec, burnRate, recentBurnRate, isActive } = calculateActivityMetrics(
    firstTs,
    lastTs,
    timeline,
    totalTokens,
    activeThresholdSec
  );

  return {
    id: sessionId,
    project: buildProjectName(sessionPath, homeDir),
    title: firstUserMsg || '(no title)',
    model,
    first_ts: firstTs,
    last_ts: lastTs,
    duration_sec: Math.floor(durationSec),
    active_sec: Math.floor(activeSec),
    is_active: isActive,
    msg_count: msgCount,
    user_msg_count: userMsgCount,
    input_tokens: totalIn,
    output_tokens: totalOut,
    cache_read_tokens: cacheRead,
    cache_create_tokens: cacheCreate,
    total_tokens: totalTokens,
    burn_rate_per_min: Math.floor(burnRate),
    recent_burn_rate_per_min: Math.floor(recentBurnRate),
    window_tokens: windowTokens,
    subagent_count: Object.keys(subagentStats).filter((name) => name !== 'main').length,
    subagents: subagentStats,
    model_stats: modelStats,
    timeline: buildCumulativeTimeline(timeline),
    api_cost: calculateSessionCost(modelStats),
  };
}

module.exports = {
  ACTIVE_THRESHOLD_SEC,
  buildSessionAggregate,
};
