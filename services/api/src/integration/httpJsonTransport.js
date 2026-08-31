'use strict';

const { boundaryError } = require('../core/boundaryError');

function positiveMs(value, fallback = 5000, max = 30000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function normalizeBaseUrl(value) {
  const text = String(value || '').trim().replace(/\/+$/, '');
  if (!text) throw boundaryError('ERP_INTEGRATION_BASE_URL_REQUIRED', 'ERP integration base URL is required');
  let parsed;
  try { parsed = new URL(text); }
  catch (_) { throw boundaryError('ERP_INTEGRATION_BASE_URL_INVALID', 'ERP integration base URL is invalid'); }
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw boundaryError('ERP_INTEGRATION_BASE_URL_INVALID', 'ERP integration base URL must use HTTP or HTTPS');
  }
  return text;
}

function requiredCredential(value, code, message) {
  const text = String(value || '').trim();
  if (!text) throw boundaryError(code, message);
  return text;
}

function unwrapIgwEnvelope(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw boundaryError(
      'ERP_INTEGRATION_RESPONSE_INVALID',
      'AkshaERP integration returned an invalid response envelope',
      502
    );
  }
  if (payload.success !== true || !Object.prototype.hasOwnProperty.call(payload, 'data')) {
    throw boundaryError(
      'ERP_INTEGRATION_RESPONSE_INVALID',
      'AkshaERP integration returned an invalid response envelope',
      502
    );
  }
  return payload.data;
}

function createHttpJsonTransport({
  baseUrl,
  apiClientId,
  apiKey,
  timeoutMs = 5000,
  fetchImpl = global.fetch,
} = {}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const normalizedApiClientId = requiredCredential(
    apiClientId,
    'ERP_INTEGRATION_API_CLIENT_ID_REQUIRED',
    'ERP Integration Gateway API client id is required'
  );
  const normalizedApiKey = requiredCredential(
    apiKey,
    'ERP_INTEGRATION_API_KEY_REQUIRED',
    'ERP Integration Gateway API key is required'
  );
  if (typeof fetchImpl !== 'function') {
    throw boundaryError('ERP_INTEGRATION_FETCH_REQUIRED', 'A fetch implementation is required');
  }
  const timeout = positiveMs(timeoutMs);

  async function request({ method = 'POST', path, body = {}, headers = {} } = {}) {
    const requestPath = String(path || '').trim();
    if (!requestPath.startsWith('/')) {
      throw boundaryError('ERP_INTEGRATION_PATH_INVALID', 'ERP integration path must begin with /');
    }

    const bodyText = body === undefined || body === null ? '' : JSON.stringify(body);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    if (typeof timer.unref === 'function') timer.unref();

    let response;
    try {
      response = await fetchImpl(`${normalizedBaseUrl}${requestPath}`, {
        method: String(method).toUpperCase(),
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-api-client-id': normalizedApiClientId,
          'x-api-key': normalizedApiKey,
          ...headers,
        },
        body: bodyText || undefined,
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw boundaryError('ERP_INTEGRATION_TIMEOUT', 'AkshaERP integration request timed out', 504);
      }
      throw boundaryError('ERP_INTEGRATION_UNAVAILABLE', 'AkshaERP integration request failed', 502);
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    let payload = null;
    if (text) {
      try { payload = JSON.parse(text); }
      catch (_) {
        throw boundaryError('ERP_INTEGRATION_RESPONSE_INVALID', 'AkshaERP integration returned invalid JSON', 502);
      }
    }

    if (!response.ok) {
      const error = boundaryError(
        'ERP_INTEGRATION_HTTP_ERROR',
        `AkshaERP integration returned HTTP ${response.status}`,
        response.status >= 500 ? 502 : response.status
      );
      error.remote_status = response.status;
      error.remote_code = payload?.errorCode || payload?.code || null;
      error.remote_request_id = payload?.requestId || null;
      throw error;
    }

    return unwrapIgwEnvelope(payload);
  }

  return Object.freeze({ request });
}

module.exports = {
  createHttpJsonTransport,
  normalizeBaseUrl,
  unwrapIgwEnvelope,
};
