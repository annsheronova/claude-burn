const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { URL } = require('url');

const ACTIVE_THRESHOLD_SEC = 120;
const HOME_DIR = os.homedir();

function parseSession(sessionPath, windowStartISO) {
  const sid = path.basename(sessionPath, '.jsonl');
  const sessionDir = path.join(path.dirname(sessionPath), sid);

  const files = [{ path: sessionPath, isSubagent: false, name: 'main' }];
  const subagentDir = path.join(sessionDir, 'subagents');
  try {
    if (fs.statSync(subagentDir).isDirectory()) {
      for (const f of fs.readdirSync(subagentDir)) {
        if (f.endsWith('.jsonl')) {
          files.push({
            path: path.join(subagentDir, f),
            isSubagent: true,
            name: path.basename(f, '.jsonl'),
          });
        }
      }
    }
  } catch {}

  let totalIn = 0, totalOut = 0, cacheRead = 0, cacheCreate = 0, msgCount = 0;
  let userMsgCount = 0, windowTokens = 0;
  let firstTs = null, lastTs = null;
  let model = '';
  let firstUserMsg = '';
  const subagentStats = {};
  const modelStats = {}; // per-model token tracking
  const timeline = [];

  for (const file of files) {
    const agentName = file.name;
    if (!subagentStats[agentName]) {
      subagentStats[agentName] = { input: 0, output: 0, cache_read: 0, cache_create: 0, total: 0, messages: 0, model: '' };
    }

    let data;
    try { data = fs.readFileSync(file.path, 'utf8'); } catch { continue; }

    for (const line of data.split('\n')) {
      if (!line.trim()) continue;
      let d;
      try { d = JSON.parse(line); } catch { continue; }

      const ts = d.timestamp || '';
      if (ts) {
        if (!firstTs || ts < firstTs) firstTs = ts;
        if (!lastTs || ts > lastTs) lastTs = ts;
      }

      const msg = (d.message || {});

      if (!file.isSubagent && msg.role === 'user') {
        userMsgCount++;
        if (!firstUserMsg) {
          const content = msg.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block && block.type === 'text' && block.text) {
                firstUserMsg = block.text.slice(0, 80);
                break;
              }
            }
          } else if (typeof content === 'string') {
            firstUserMsg = content.slice(0, 80);
          }
        }
      }

      const usage = msg.usage;
      if (!usage) continue;

      const inp = usage.input_tokens || 0;
      const out = usage.output_tokens || 0;
      const cr = usage.cache_read_input_tokens || 0;
      const cc = usage.cache_creation_input_tokens || 0;
      const entryModel = msg.model || '';
      if (entryModel) {
        model = entryModel;
        if (!subagentStats[agentName].model) subagentStats[agentName].model = entryModel;
      }

      // Track per-model tokens
      const mkey = entryModel || 'unknown';
      if (!modelStats[mkey]) modelStats[mkey] = { input: 0, output: 0, cache_read: 0, cache_create: 0 };
      modelStats[mkey].input += inp;
      modelStats[mkey].output += out;
      modelStats[mkey].cache_read += cr;
      modelStats[mkey].cache_create += cc;

      totalIn += inp;
      totalOut += out;
      cacheRead += cr;
      cacheCreate += cc;
      msgCount++;

      if (windowStartISO && ts && ts >= windowStartISO) {
        windowTokens += inp + out + cr + cc;
      }

      const sa = subagentStats[agentName];
      sa.input += inp;
      sa.output += out;
      sa.cache_read += cr;
      sa.cache_create += cc;
      sa.total += inp + out + cr + cc;
      sa.messages++;

      if (ts) {
        timeline.push({ ts, tokens: inp + out + cr + cc, agent: agentName });
      }
    }
  }

  const totalTokens = totalIn + totalOut + cacheRead + cacheCreate;

  // Sort timeline for duration calculations
  timeline.sort((a, b) => (a.ts > b.ts ? 1 : -1));

  let durationSec = 0, activeSec = 0, burnRate = 0, recentBurnRate = 0;
  const IDLE_GAP_SEC = 120; // gaps > 2 min count as idle

  if (firstTs && lastTs) {
    try {
      const t1 = new Date(firstTs).getTime();
      const t2 = new Date(lastTs).getTime();
      durationSec = Math.max((t2 - t1) / 1000, 1);

      // Calculate active time (exclude idle gaps > 2 min)
      activeSec = 0;
      for (let i = 1; i < timeline.length; i++) {
        const prev = new Date(timeline[i - 1].ts).getTime();
        const curr = new Date(timeline[i].ts).getTime();
        const gap = (curr - prev) / 1000;
        if (gap <= IDLE_GAP_SEC) {
          activeSec += gap;
        }
      }
      activeSec = Math.max(activeSec, 1);

      burnRate = totalTokens / (activeSec / 60);

      // Recent burn rate: only for active sessions, based on real-time last 3 minutes
      const isCurrentlyActive = (Date.now() - t2) / 1000 < ACTIVE_THRESHOLD_SEC;
      if (isCurrentlyActive) {
        const recentCutoff = new Date(Date.now() - 3 * 60 * 1000).toISOString();
        let recentTokens = 0;
        let recentFirst = null;
        for (const entry of timeline) {
          if (entry.ts >= recentCutoff) {
            recentTokens += entry.tokens;
            if (!recentFirst) recentFirst = entry.ts;
          }
        }
        if (recentFirst) {
          const recentDuration = Math.max((Date.now() - new Date(recentFirst).getTime()) / 1000 / 60, 0.1);
          recentBurnRate = recentTokens / recentDuration;
        }
      }
    } catch {}
  }

  let isActive = false;
  if (lastTs) {
    try {
      const t2 = new Date(lastTs).getTime();
      isActive = (Date.now() - t2) / 1000 < ACTIVE_THRESHOLD_SEC;
    } catch {}
  }

  // Clean project name from directory
  const projectDirName = path.basename(path.dirname(sessionPath));
  const homeEscaped = HOME_DIR.replace(/\//g, '-').replace(/^-/, '');
  const project = projectDirName.replace(`-${homeEscaped}-`, '~/').replace(/-/g, '/');

  // Sample timeline (already sorted above)
  const cumulativeTimeline = [];
  let cum = 0;
  const step = Math.max(1, Math.floor(timeline.length / 200));
  for (let i = 0; i < timeline.length; i++) {
    cum += timeline[i].tokens;
    if (i % step === 0 || i === timeline.length - 1) {
      cumulativeTimeline.push({ ts: timeline[i].ts, cumulative: cum, agent: timeline[i].agent });
    }
  }

  return {
    id: sid,
    project,
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
    subagent_count: Object.keys(subagentStats).filter(k => k !== 'main').length,
    subagents: subagentStats,
    model_stats: modelStats,
    timeline: cumulativeTimeline,
  };
}

function getAllSessions(dataDir, hoursBack, projectFilter, windowStartISO) {
  const cutoff = Date.now() - hoursBack * 3600 * 1000;
  const sessions = [];

  let projectDirs;
  try { projectDirs = fs.readdirSync(dataDir); } catch { return []; }

  for (const dirName of projectDirs) {
    const projectDir = path.join(dataDir, dirName);
    try { if (!fs.statSync(projectDir).isDirectory()) continue; } catch { continue; }
    if (projectFilter && !projectDir.includes(projectFilter)) continue;

    let files;
    try { files = fs.readdirSync(projectDir); } catch { continue; }

    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue;
      const fp = path.join(projectDir, f);
      try {
        const stat = fs.statSync(fp);
        if (stat.mtimeMs < cutoff) continue;
        sessions.push(parseSession(fp, windowStartISO));
      } catch (e) {
        console.error(`Error parsing ${fp}: ${e.message}`);
      }
    }
  }

  sessions.sort((a, b) => (b.last_ts || '').localeCompare(a.last_ts || ''));
  return sessions;
}

function createServer({ port, dataDir }) {
  const publicDir = path.join(__dirname, '..', 'public');

  return http.createServer((req, res) => {
    const parsed = new URL(req.url, `http://localhost:${port}`);
    const pathname = parsed.pathname;
    const params = parsed.searchParams;

    if (pathname === '/api/sessions') {
      const hours = parseInt(params.get('hours') || '24', 10);
      const project = params.get('project') || null;
      const windowMin = parseInt(params.get('window_minutes') || '0', 10);
      const windowPct = parseFloat(params.get('window_pct') || '0');

      let windowStartISO = null;
      if (windowMin > 0) {
        windowStartISO = new Date(Date.now() - windowMin * 60 * 1000).toISOString();
      }

      const data = getAllSessions(dataDir, hours, project, windowStartISO);

      const totalTokens = data.reduce((s, d) => s + d.total_tokens, 0);
      const activeCount = data.filter(d => d.is_active).length;

      // Calculate API-equivalent cost per model
      const PRICING = {
        'opus': { input: 5, output: 25, cache_read: 0.5, cache_create: 6.25 },
        'sonnet': { input: 3, output: 15, cache_read: 0.3, cache_create: 3.75 },
        'haiku': { input: 1, output: 5, cache_read: 0.1, cache_create: 1.25 },
      };
      function getPricing(modelName) {
        if (modelName.includes('haiku')) return PRICING.haiku;
        if (modelName.includes('sonnet')) return PRICING.sonnet;
        return PRICING.opus;
      }

      let costInput = 0, costOutput = 0, costCR = 0, costCC = 0;
      for (const session of data) {
        for (const [mname, ms] of Object.entries(session.model_stats || {})) {
          const p = getPricing(mname);
          costInput += ms.input / 1e6 * p.input;
          costOutput += ms.output / 1e6 * p.output;
          costCR += ms.cache_read / 1e6 * p.cache_read;
          costCC += ms.cache_create / 1e6 * p.cache_create;
        }
      }
      const apiCost = {
        input: Math.round(costInput * 100) / 100,
        output: Math.round(costOutput * 100) / 100,
        cache_read: Math.round(costCR * 100) / 100,
        cache_create: Math.round(costCC * 100) / 100,
      };
      apiCost.total = Math.round((apiCost.input + apiCost.output + apiCost.cache_read + apiCost.cache_create) * 100) / 100;

      jsonResponse(res, {
        generated_at: new Date().toISOString(),
        summary: {
          total_sessions: data.length,
          active_sessions: activeCount,
          total_tokens: totalTokens,
          api_cost: apiCost,
        },
        sessions: data,
      });

    } else if (pathname === '/api/session') {
      const sid = params.get('id');
      if (!sid) return jsonResponse(res, { error: 'missing id' }, 400);

      let projectDirs;
      try { projectDirs = fs.readdirSync(dataDir); } catch { return jsonResponse(res, { error: 'cannot read data dir' }, 500); }

      for (const dirName of projectDirs) {
        const fp = path.join(dataDir, dirName, `${sid}.jsonl`);
        try {
          if (fs.existsSync(fp)) {
            return jsonResponse(res, parseSession(fp));
          }
        } catch {}
      }
      jsonResponse(res, { error: 'session not found' }, 404);

    } else if (pathname === '/' || pathname === '/index.html') {
      const htmlPath = path.join(publicDir, 'index.html');
      try {
        const html = fs.readFileSync(htmlPath, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Length': Buffer.byteLength(html) });
        res.end(html);
      } catch {
        res.writeHead(404);
        res.end('index.html not found');
      }

    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });
}

function jsonResponse(res, data, code = 200) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

module.exports = { createServer, getAllSessions, parseSession };
