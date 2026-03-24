#!/usr/bin/env node

const { createServer, getAllSessions } = require('../src/server');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const pkg = require('../package.json');
const args = process.argv.slice(2);

if (args.includes('--version') || args.includes('-v')) {
  console.log(pkg.version);
  process.exit(0);
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
  \x1b[32mclaude-burn\x1b[0m v${pkg.version}
  Monitor Claude Code token usage

  Usage:
    claude-burn [options]

  Options:
    --port <n>        Server port (default: 8787)
    --data-dir <path> Claude data directory (default: ~/.claude/projects)
    --no-open         Don't auto-open browser
    --version, -v     Show version
    --help, -h        Show this help
`);
  process.exit(0);
}

function getArg(flag, defaultVal) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return defaultVal;
}

const port = parseInt(getArg('--port', '8787'), 10);
const dataDir = getArg('--data-dir',
  process.env.CLAUDE_CONFIG_DIR
    ? path.join(process.env.CLAUDE_CONFIG_DIR, 'projects')
    : path.join(os.homedir(), '.claude', 'projects')
);
const noOpen = args.includes('--no-open');

// Check if data directory exists
if (!fs.existsSync(dataDir)) {
  console.log(`\n  \x1b[32mclaude-burn\x1b[0m v${pkg.version}\n`);
  console.log(`  \x1b[31mNo Claude Code data found at:\x1b[0m ${dataDir}`);
  console.log(`  Make sure Claude Code is installed and has been used at least once.`);
  console.log(`  Or specify a custom path: claude-burn --data-dir /path/to/projects\n`);
  process.exit(1);
}

// Count sessions
let sessionCount = 0;
try {
  for (const dir of fs.readdirSync(dataDir)) {
    const dirPath = path.join(dataDir, dir);
    if (fs.statSync(dirPath).isDirectory()) {
      for (const f of fs.readdirSync(dirPath)) {
        if (f.endsWith('.jsonl')) sessionCount++;
      }
    }
  }
} catch {}

const server = createServer({ port, dataDir });

server.listen(port, '127.0.0.1', () => {
  const url = `http://localhost:${port}`;
  console.log(`\n  \x1b[32mclaude-burn\x1b[0m v${pkg.version}\n`);
  console.log(`  Dashboard:  \x1b[4m${url}\x1b[0m`);
  console.log(`  Scanning:   ${dataDir} (${sessionCount} sessions)`);
  console.log(`\n  Press \x1b[2mCtrl+C\x1b[0m to stop\n`);

  if (!noOpen) {
    const cmd = process.platform === 'darwin' ? `open "${url}"`
      : process.platform === 'win32' ? `start "${url}"`
      : `xdg-open "${url}"`;
    exec(cmd, () => {});
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`\n  \x1b[31mPort ${port} is already in use.\x1b[0m`);
    console.log(`  Try: claude-burn --port ${port + 1}\n`);
    process.exit(1);
  }
  throw err;
});

// Graceful shutdown
function shutdown() {
  console.log('\n  Stopped.\n');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
