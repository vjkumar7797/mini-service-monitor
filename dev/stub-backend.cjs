/**
 * THROWAWAY stub of the Task 1 monitoring backend.
 *
 * The real backend (src/server.js) belongs to Task 1 / @vjkumar7797 and is not
 * merged yet. This file exists only so the Task 2 dashboard can be run,
 * demoed and broken locally before Task 1 lands.
 *
 * It implements the same contract:
 *   GET  /health      -> {"status":"ok"}
 *   GET  /api/status  -> list of services
 *   POST /api/check   -> re-check every service, return the list
 *
 * Service shape: {name, status: UP|DOWN, httpCode, responseTimeMs, error, checkedAt}
 *
 * Env:
 *   PORT              listen port           (default 3000)
 *   HOST              bind address          (default 0.0.0.0)
 *   REQUEST_TIMEOUT_MS per-service timeout   (default 5000)
 *   ALLOW_CORS        "1" sends Access-Control-Allow-Origin: * (default: off)
 */

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 5000);
const ALLOW_CORS = process.env.ALLOW_CORS === '1';

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// Fixed list, no arbitrary URLs from the client (SSRF guard).
// SERVICES_JSON lets the tests point the checks at local servers instead of
// the public internet, so the suite is fast and offline.
const SERVICES = process.env.SERVICES_JSON
  ? JSON.parse(process.env.SERVICES_JSON)
  : [
      { name: 'GitHub', url: 'https://github.com' },
      { name: 'Example.com', url: 'https://example.com' },
      { name: 'JSONPlaceholder', url: 'https://jsonplaceholder.typicode.com/todos/1' },
      { name: 'Our API', url: `http://127.0.0.1:${PORT}/health` },
    ];

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function checkService(service) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const client = service.url.startsWith('https:') ? https : http;
    const req = client.request(
      service.url,
      { method: 'GET', timeout: TIMEOUT_MS },
      (res) => {
        res.resume();
        const responseTimeMs = Date.now() - startedAt;
        const up = res.statusCode >= 200 && res.statusCode < 400;
        resolve({
          name: service.name,
          status: up ? 'UP' : 'DOWN',
          httpCode: res.statusCode,
          responseTimeMs,
          error: up ? null : `HTTP ${res.statusCode}`,
          checkedAt: new Date().toISOString(),
        });
      },
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({
        name: service.name,
        status: 'DOWN',
        httpCode: null,
        responseTimeMs: Date.now() - startedAt,
        error: `timeout after ${TIMEOUT_MS}ms`,
        checkedAt: new Date().toISOString(),
      });
    });

    req.on('error', (err) => {
      resolve({
        name: service.name,
        status: 'DOWN',
        httpCode: null,
        responseTimeMs: Date.now() - startedAt,
        error: err.code ? `${err.code}: ${err.message}` : err.message,
        checkedAt: new Date().toISOString(),
      });
    });

    req.end();
  });
}

async function checkAll() {
  const services = await Promise.all(SERVICES.map(checkService));
  return { services, checkedAt: new Date().toISOString() };
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendStatic(res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const filePath = path.join(PUBLIC_DIR, rel);

  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== path.join(PUBLIC_DIR, 'index.html')) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    const type = CONTENT_TYPES[path.extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }).end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { pathname } = url;

  if (ALLOW_CORS) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  if (pathname === '/health') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }

  if (pathname === '/api/status' && req.method === 'GET') {
    sendJson(res, 200, await checkAll());
    return;
  }

  if (pathname === '/api/check' && req.method === 'POST') {
    sendJson(res, 200, await checkAll());
    return;
  }

  if (req.method === 'GET') {
    sendStatic(res, pathname);
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`stub-backend listening on http://${HOST}:${PORT} (cors=${ALLOW_CORS})`);
  });
}

module.exports = { server, checkAll, checkService, SERVICES };
