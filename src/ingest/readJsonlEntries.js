const fs = require('fs');

function readJsonlEntries(filePath) {
  let data;
  try {
    data = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }

  const entries = [];
  for (const line of data.split('\n')) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {}
  }
  return entries;
}

module.exports = { readJsonlEntries };
