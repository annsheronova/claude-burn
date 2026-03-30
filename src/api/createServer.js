const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const { buildSummary, findSessionById, getAllSessions } = require('../query/sessions');

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
};

function jsonResponse(res, data, code = 200) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function servePublicFile(res, publicDir, pathname) {
  const decodedPath = decodeURIComponent(pathname);
  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
  const filePath = path.resolve(publicDir, relativePath);
  const publicRoot = path.resolve(publicDir);

  if (!filePath.startsWith(publicRoot + path.sep) && filePath !== path.join(publicRoot, 'index.html')) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const body = fs.readFileSync(filePath);
    const contentType = CONTENT_TYPES[path.extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': body.length,
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end(relativePath === 'index.html' ? 'index.html not found' : 'Not found');
  }
}

function createServer({ port, dataDir }) {
  const publicDir = path.join(__dirname, '..', '..', 'public');

  return http.createServer((req, res) => {
    const parsed = new URL(req.url, `http://localhost:${port}`);
    const pathname = parsed.pathname;
    const params = parsed.searchParams;

    if (pathname === '/api/sessions') {
      const hours = parseInt(params.get('hours') || '24', 10);
      const project = params.get('project') || null;
      const windowMin = parseInt(params.get('window_minutes') || '0', 10);
      parseFloat(params.get('window_pct') || '0');

      let windowStartISO = null;
      if (windowMin > 0) {
        windowStartISO = new Date(Date.now() - windowMin * 60 * 1000).toISOString();
      }

      const sessions = getAllSessions(dataDir, hours, project, windowStartISO);
      jsonResponse(res, {
        generated_at: new Date().toISOString(),
        summary: buildSummary(sessions),
        sessions,
      });
      return;
    }

    if (pathname === '/api/session') {
      const sessionId = params.get('id');
      if (!sessionId) {
        jsonResponse(res, { error: 'missing id' }, 400);
        return;
      }

      const session = findSessionById(dataDir, sessionId);
      if (!session) {
        jsonResponse(res, { error: 'session not found' }, 404);
        return;
      }

      jsonResponse(res, session);
      return;
    }

    servePublicFile(res, publicDir, pathname);
  });
}

module.exports = {
  createServer,
  jsonResponse,
};
