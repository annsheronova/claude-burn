const fs = require('fs');
const path = require('path');

function discoverSessionFiles(sessionPath) {
  const sessionId = path.basename(sessionPath, '.jsonl');
  const sessionDir = path.join(path.dirname(sessionPath), sessionId);
  const files = [{ path: sessionPath, isSubagent: false, name: 'main' }];
  const subagentDir = path.join(sessionDir, 'subagents');

  try {
    if (fs.statSync(subagentDir).isDirectory()) {
      for (const fileName of fs.readdirSync(subagentDir)) {
        if (!fileName.endsWith('.jsonl')) continue;
        files.push({
          path: path.join(subagentDir, fileName),
          isSubagent: true,
          name: path.basename(fileName, '.jsonl'),
        });
      }
    }
  } catch {}

  return files;
}

module.exports = { discoverSessionFiles };
