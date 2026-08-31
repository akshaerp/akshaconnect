'use strict';

const { boundaryError } = require('../core/boundaryError');
const { signServiceRequest } = require('./serviceToServiceSigner');

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

function createHttpJsonTransport({
  baseUrl,
  sharedSecret,
  serviceId,
  contractVersion,
  timeoutMs = 5000,
  fetchImpl = global.fetch,
  now = () => new Date().toISOString(),
  nonce = () => require('crypto').randomUUID(),
} = {}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (!String(sharedSecret || '').trim()) {
    throw boundaryError('ERP_INTEGRATION_SECRET_REQUIRED', 'ERP integration shared secret is required');
  }
  if (!String(serviceId || '').trim()) {
    throw boundaryError('ERP_INTEGRATION_SERVICE_ID_REQUIRED', 'ERP integration service id is required');
  }
  if (!String(contractVersion || '').trim()) {
    throw boundaryError('ERP_INTEGRATION_CONTRACT_REQUIRED', 'ERP integration contract version is required');
  }
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
    const signedHeaders = signServiceRequest({
      method,
      path: requestPath,
      bodyText,
      sharedSecret,
      serviceId,
      contractVersion,
      timestamp: now(),
      nonce: nonce(),
    });
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
          ...signedHeaders,
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
      error.remote_code = payload?.code || null;
      throw error;
    }

    return payload;
  }

  return Object.freeze({ request });
}

module.exports = {
  createHttpJsonTransport,
  normalizeBaseUrl,
};
