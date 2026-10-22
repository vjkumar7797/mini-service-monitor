/*
 * Service Status dashboard.
 *
 * The API base URL is configuration, never hardcoded in the request logic.
 * Resolution order (first hit wins):
 *   1. localStorage  - "apiBaseUrl" (set from the field on the page)
 *   2. ?api=...      - query parameter, handy for one-off testing
 *   3. <meta name="api-base-url" content="..."> in index.html
 *   4. ""            - same origin as the page (default)
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'apiBaseUrl';
  var REQUEST_TIMEOUT_MS = 10000;

  var els = {
    banner: document.getElementById('banner'),
    bannerDetail: document.getElementById('banner-detail'),
    body: document.getElementById('status-body'),
    checkNow: document.getElementById('check-now'),
    apiInput: document.getElementById('api-base-url'),
    applyApi: document.getElementById('apply-api-url'),
    apiHint: document.getElementById('api-base-hint'),
    summary: document.getElementById('summary'),
    footerUpdated: document.getElementById('footer-updated'),
  };

  function readMetaApiBase() {
    var meta = document.querySelector('meta[name="api-base-url"]');
    return meta ? (meta.getAttribute('content') || '').trim() : '';
  }

  function resolveApiBase() {
    var stored = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      stored = null;
    }

    if (stored !== null && stored !== '') {
      return { base: stored, source: 'localStorage' };
    }

    var params = new URLSearchParams(window.location.search);
    if (params.get('api')) {
      return { base: params.get('api'), source: 'query parameter' };
    }

    var metaBase = readMetaApiBase();
    if (metaBase) {
      return { base: metaBase, source: 'index.html meta tag' };
    }

    return { base: '', source: 'default (same origin)' };
  }

  function normalizeBase(base) {
    return base.replace(/\/+$/, '');
  }

  function apiUrl(endpoint) {
    return normalizeBase(resolveApiBase().base) + endpoint;
  }

  function showApiBase() {
    var resolved = resolveApiBase();
    var shown = resolved.base === '' ? '(same origin)' : resolved.base;
    els.apiHint.textContent = 'using ' + shown + ' — from ' + resolved.source;
    if (document.activeElement !== els.apiInput) {
      els.apiInput.value = resolved.base;
    }
  }

  function showBanner(detail) {
    els.bannerDetail.textContent = detail;
    els.banner.hidden = false;
  }

  function hideBanner() {
    els.banner.hidden = true;
    els.bannerDetail.textContent = '';
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatMs(value) {
    if (value === null || value === undefined) {
      return '—';
    }
    return Number(value) + ' ms';
  }

  function formatTime(iso) {
    if (!iso) {
      return '—';
    }
    var date = new Date(iso);
    if (isNaN(date.getTime())) {
      return escapeHtml(iso);
    }
    return date.toLocaleTimeString();
  }

  function formatRelative(iso) {
    if (!iso) {
      return 'never';
    }
    var date = new Date(iso);
    if (isNaN(date.getTime())) {
      return '';
    }
    var seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) {
      return seconds + 's ago';
    }
    var minutes = Math.round(seconds / 60);
    if (minutes < 60) {
      return minutes + 'm ago';
    }
    var hours = Math.round(minutes / 60);
    return hours + 'h ago';
  }

  // The backend may answer with a bare array or with {services: [...]}.
  function extractServices(payload) {
    if (Array.isArray(payload)) {
      return payload;
    }
    if (payload && Array.isArray(payload.services)) {
      return payload.services;
    }
    if (payload && Array.isArray(payload.data)) {
      return payload.data;
    }
    return [];
  }

  function renderRows(services) {
    if (!services.length) {
      els.body.innerHTML =
        '<tr class="placeholder"><td colspan="5">No services returned by the backend</td></tr>';
      return;
    }

    var up = 0;
    var down = 0;

    var html = services
      .map(function (service) {
        var status = String(service.status || 'UNKNOWN').toUpperCase();
        if (status === 'UP') {
          up += 1;
        } else {
          down += 1;
        }

        var row =
          '<tr class="service-row">' +
          '<td class="col-service">' + escapeHtml(service.name) + '</td>' +
          '<td><span class="badge badge-' + escapeHtml(status.toLowerCase()) + '">' +
          escapeHtml(status) + '</span></td>' +
          '<td class="col-code">' +
          (service.httpCode === null || service.httpCode === undefined
            ? '—'
            : escapeHtml(service.httpCode)) +
          '</td>' +
          '<td class="col-time">' + escapeHtml(formatMs(service.responseTimeMs)) + '</td>' +
          '<td class="col-checked" data-checked="' + escapeHtml(service.checkedAt || '') + '">' +
          escapeHtml(formatTime(service.checkedAt)) +
          ' <span class="muted">(' + escapeHtml(formatRelative(service.checkedAt)) + ')</span>' +
          '</td>' +
          '</tr>';

        if (service.error) {
          row +=
            '<tr class="error-row"><td colspan="5">' +
            '<span class="error-label">Error</span> ' +
            escapeHtml(service.error) +
            '</td></tr>';
        }

        return row;
      })
      .join('');

    els.body.innerHTML = html;
    els.summary.textContent = up + ' up · ' + down + ' down';
    refreshRelativeTimes();
  }

  function refreshRelativeTimes() {
    var cells = els.body.querySelectorAll('.col-checked[data-checked]');
    for (var i = 0; i < cells.length; i += 1) {
      var iso = cells[i].getAttribute('data-checked');
      var muted = cells[i].querySelector('.muted');
      if (muted) {
        muted.textContent = '(' + formatRelative(iso) + ')';
      }
    }
  }

  function renderErrorState(message) {
    els.summary.textContent = '';
    els.body.innerHTML =
      '<tr class="placeholder"><td colspan="5">No data — the API could not be reached</td></tr>';
    els.footerUpdated.textContent = '';
    showBanner(message);
  }

  function request(endpoint, method) {
    var controller = new AbortController();
    var timer = window.setTimeout(function () {
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    return fetch(apiUrl(endpoint), {
      method: method,
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(function (response) {
        window.clearTimeout(timer);
        if (!response.ok) {
          throw new Error('HTTP ' + response.status + ' ' + response.statusText);
        }
        return response.json();
      })
      .catch(function (err) {
        window.clearTimeout(timer);
        if (err && err.name === 'AbortError') {
          throw new Error('request timed out after ' + REQUEST_TIMEOUT_MS + 'ms');
        }
        // A TypeError here is almost always the browser refusing a
        // cross-origin response (CORS) or the host/port being down.
        throw new Error(err && err.message ? err.message : String(err));
      });
  }

  function loadStatus() {
    return request('/api/status', 'GET')
      .then(function (payload) {
        hideBanner();
        renderRows(extractServices(payload));
        els.footerUpdated.textContent = 'Updated ' + formatTime(new Date().toISOString());
      })
      .catch(function (err) {
        renderErrorState(err.message + ' (GET ' + apiUrl('/api/status') + ')');
      });
  }

  function checkNow() {
    els.checkNow.disabled = true;
    els.checkNow.textContent = 'Checking…';
    els.checkNow.classList.add('busy');

    return request('/api/check', 'POST')
      .then(function (payload) {
        hideBanner();
        renderRows(extractServices(payload));
        els.footerUpdated.textContent = 'Checked ' + formatTime(new Date().toISOString());
      })
      .catch(function (err) {
        renderErrorState(err.message + ' (POST ' + apiUrl('/api/check') + ')');
      })
      .then(function () {
        els.checkNow.disabled = false;
        els.checkNow.textContent = 'Check Now';
        els.checkNow.classList.remove('busy');
      });
  }

  els.checkNow.addEventListener('click', checkNow);

  els.applyApi.addEventListener('click', function () {
    var value = normalizeBase(els.apiInput.value.trim());
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch (err) {
      /* storage unavailable (private mode) — keep going with the value anyway */
    }
    showApiBase();
    loadStatus();
  });

  els.apiInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      els.applyApi.click();
    }
  });

  showApiBase();
  loadStatus();
  window.setInterval(refreshRelativeTimes, 5000);
})();
