/**
 * Contract tests for the stub backend.
 *
 * These lock down the API shape that the Task 2 dashboard depends on, so
 * that swapping the stub for the real Task 1 backend (src/server.js) is a
 * contract check, not a guess.
 *
 * The monitored targets are local throwaway servers (set through
 * SERVICES_JSON), so the suite never depends on the public internet.
 *
 * run: node --test dev/
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function request(port, path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path, method },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

// Targets for the monitored services: one healthy, one returning 500.
const healthy = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
});
const failing = http.createServer((req, res) => {
  res.writeHead(500).end('boom');
});

let stub;
let port;

test.before(async () => {
  const healthyPort = await listen(healthy);
  const failingPort = await listen(failing);

  process.env.SERVICES_JSON = JSON.stringify([
    { name: 'Healthy Service', url: `http://127.0.0.1:${healthyPort}/` },
    { name: 'Failing Service', url: `http://127.0.0.1:${failingPort}/` },
  ]);

  // Required after SERVICES_JSON is set: the service list is read at load time.
  stub = require('./stub-backend.cjs');

  port = await new Promise((resolve) => {
    stub.server.listen(0, '127.0.0.1', () => resolve(stub.server.address().port));
  });
});

test.after(async () => {
  await close(stub.server);
  await close(healthy);
  await close(failing);
});

test('GET /health returns {"status":"ok"}', async () => {
  const res = await request(port, '/health');
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(res.body), { status: 'ok' });
});

test('GET /api/status returns a services array', async () => {
  const res = await request(port, '/api/status');
  assert.equal(res.status, 200);
  const payload = JSON.parse(res.body);
  assert.ok(Array.isArray(payload.services), 'services must be an array');
  assert.ok(payload.services.length > 0, 'at least one service');
});

test('every service carries the fields the dashboard renders', async () => {
  const res = await request(port, '/api/status');
  const { services } = JSON.parse(res.body);

  for (const service of services) {
    assert.equal(typeof service.name, 'string');
    assert.ok(['UP', 'DOWN'].includes(service.status), `bad status: ${service.status}`);
    assert.ok('httpCode' in service, 'httpCode must be present (may be null)');
    assert.equal(typeof service.responseTimeMs, 'number');
    assert.ok('error' in service, 'error must be present (may be null)');
    assert.ok(!Number.isNaN(Date.parse(service.checkedAt)), 'checkedAt must be a date');
  }
});

test('POST /api/check re-checks and returns the same shape', async () => {
  const res = await request(port, '/api/check', 'POST');
  assert.equal(res.status, 200);
  const payload = JSON.parse(res.body);
  assert.ok(Array.isArray(payload.services));
  assert.ok(payload.checkedAt, 'checkedAt must be present');
});

test('the monitored service list is fixed on the server, not sent by the client', () => {
  assert.equal(stub.SERVICES.length, 2);
  assert.deepEqual(
    stub.SERVICES.map((service) => service.name),
    ['Healthy Service', 'Failing Service'],
  );
});

test('a healthy service is UP with its HTTP code', async () => {
  const result = await stub.checkService(stub.SERVICES[0]);
  assert.equal(result.status, 'UP');
  assert.equal(result.httpCode, 200);
  assert.equal(result.error, null);
});

test('a service that returns 500 is DOWN with its HTTP code', async () => {
  const result = await stub.checkService(stub.SERVICES[1]);
  assert.equal(result.status, 'DOWN');
  assert.equal(result.httpCode, 500);
  assert.match(result.error, /500/);
});

test('an unreachable service is DOWN with an error and does not crash the app', async () => {
  const result = await stub.checkService({
    name: 'Broken Service',
    url: 'http://this-host-does-not-exist.invalid',
  });

  assert.equal(result.status, 'DOWN');
  assert.ok(result.error, 'a DOWN service must carry an error message');
  assert.equal(result.httpCode, null);

  // the app is still alive afterwards
  const res = await request(port, '/health');
  assert.equal(res.status, 200);
});

test('the dashboard page is served from the same origin as the API', async () => {
  const res = await request(port, '/');
  assert.equal(res.status, 200);
  assert.match(res.body, /Service Status/);
});
