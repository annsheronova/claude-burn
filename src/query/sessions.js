const fs = require('fs');
const path = require('path');

const { buildSessionAggregate } = require('../analytics/buildSessionAggregate');

function getAllSessions(dataDir, hoursBack, projectFilter, windowStartISO) {
  const cutoff = Date.now() - hoursBack * 3600 * 1000;
  const sessions = [];

  let projectDirs;
  try {
    projectDirs = fs.readdirSync(dataDir);
  } catch {
    return [];
  }

  for (const dirName of projectDirs) {
    const projectDir = path.join(dataDir, dirName);
    try {
      if (!fs.statSync(projectDir).isDirectory()) continue;
    } catch {
      continue;
    }
    if (projectFilter && !projectDir.includes(projectFilter)) continue;

    let files;
    try {
      files = fs.readdirSync(projectDir);
    } catch {
      continue;
    }

    for (const fileName of files) {
      if (!fileName.endsWith('.jsonl')) continue;

      const filePath = path.join(projectDir, fileName);
      try {
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs < cutoff) continue;
        sessions.push(buildSessionAggregate(filePath, { windowStartISO }));
      } catch (error) {
        console.error(`Error parsing ${filePath}: ${error.message}`);
      }
    }
  }

  sessions.sort((a, b) => (b.last_ts || '').localeCompare(a.last_ts || ''));
  return sessions;
}

function findSessionById(dataDir, sessionId) {
  let projectDirs;
  try {
    projectDirs = fs.readdirSync(dataDir);
  } catch {
    return null;
  }

  for (const dirName of projectDirs) {
    const filePath = path.join(dataDir, dirName, `${sessionId}.jsonl`);
    try {
      if (fs.existsSync(filePath)) {
        return buildSessionAggregate(filePath);
      }
    } catch {}
  }

  return null;
}

function buildSummary(sessions) {
  const totalTokens = sessions.reduce((sum, session) => sum + session.total_tokens, 0);
  const activeCount = sessions.filter((session) => session.is_active).length;
  const apiCost = { input: 0, output: 0, cache_read: 0, cache_create: 0 };

  for (const session of sessions) {
    if (!session.api_cost) continue;
    apiCost.input += session.api_cost.input;
    apiCost.output += session.api_cost.output;
    apiCost.cache_read += session.api_cost.cache_read;
    apiCost.cache_create += session.api_cost.cache_create;
  }

  apiCost.input = Math.round(apiCost.input * 100) / 100;
  apiCost.output = Math.round(apiCost.output * 100) / 100;
  apiCost.cache_read = Math.round(apiCost.cache_read * 100) / 100;
  apiCost.cache_create = Math.round(apiCost.cache_create * 100) / 100;
  apiCost.total = Math.round((apiCost.input + apiCost.output + apiCost.cache_read + apiCost.cache_create) * 100) / 100;

  return {
    total_sessions: sessions.length,
    active_sessions: activeCount,
    total_tokens: totalTokens,
    api_cost: apiCost,
  };
}

module.exports = {
  buildSummary,
  findSessionById,
  getAllSessions,
};
