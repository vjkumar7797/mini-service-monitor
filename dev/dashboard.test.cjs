/**
 * Static checks on the dashboard (public/).
 *
 * The dashboard is plain HTML/CSS/JS with no build step and no dependencies,
 * so these assertions are deliberately simple: they read the files as text and
 * check the wiring that the browser needs. They fail fast if someone renames
 * an id in index.html without updating app.js.
 *
 * run: node --test dev/
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const read = (file) => fs.readFileSync(path.join(PUBLIC_DIR, file), 'utf8');

const html = read('index.html');
const js = read('app.js');
const css = read('style.css');

test('index.html loads the stylesheet and the script', () => {
  assert.match(html, /<link[^>]+href="style\.css"/);
  assert.match(html, /<script[^>]+src="app\.js"/);
});

test('the page has the ids app.js drives', () => {
  for (const id of ['banner', 'banner-detail', 'check-now', 'status-body', 'api-base-url']) {
    assert.ok(html.includes(`id="${id}"`), `index.html is missing id="${id}"`);
  }
});

test('the table has the five required columns', () => {
  for (const column of ['Service', 'Status', 'HTTP code', 'Response time', 'Last checked']) {
    assert.ok(html.includes(column), `table is missing the "${column}" column`);
  }
});

test('the API base URL is configurable, not hardcoded in the request', () => {
  assert.match(html, /<meta name="api-base-url"/, 'index.html needs the api-base-url meta tag');
  assert.match(js, /apiBaseUrl/, 'app.js must read the base URL from configuration');
  assert.match(js, /function apiUrl\(endpoint\)/, 'app.js must build URLs from the base URL');
  assert.match(js, /apiUrl\(endpoint\)/, 'app.js must send requests to apiUrl(endpoint)');
});

test('the two API calls the dashboard makes', () => {
  assert.match(js, /request\('\/api\/status', 'GET'\)/);
  assert.match(js, /request\('\/api\/check', 'POST'\)/);
  assert.match(js, /method: method/, 'app.js must pass the method through to fetch');
});

test('a failed request shows the banner instead of leaving the page blank', () => {
  assert.match(js, /showBanner/, 'app.js must call showBanner on failure');
  assert.match(js, /renderErrorState/, 'app.js must render an error state on failure');
  assert.match(css, /\.banner/, 'style.css must style the banner');
});

test('the banner element is hidden until a failure happens', () => {
  assert.match(html, /id="banner"[^>]*hidden/, 'the banner must start hidden');
});
