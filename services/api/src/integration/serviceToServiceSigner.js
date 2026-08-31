'use strict';

const crypto = require('crypto');
const { boundaryError } = require('../core/boundaryError');

function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function canonicalPayload({ method, path, timestamp, nonce, bodyText }) {
  const normalizedMethod = clean(method).toUpperCase();
  const normalizedPath = clean(path);
  const normalizedTimestamp = clean(timestamp);
  const normalizedNonce = clean(nonce);

  if (!normalizedMethod || !normalizedPath || !normalizedTimestamp || !normalizedNonce) {
    throw boundaryError('ERP_INTEGRATION_SIGN_INPUT_INVALID', 'Signed transport fields are required');
  }

  const contentSha256 = sha256Hex(bodyText || '');
  return {
    contentSha256,
    canonical: [
      normalizedMethod,
      normalizedPath,
      normalizedTimestamp,
      normalizedNonce,
      contentSha256,
    ].join('\n'),
  };
}

function signServiceRequest({
  method,
  path,
  bodyText = '',
  sharedSecret,
  serviceId,
  contractVersion,
  timestamp = new Date().toISOString(),
  nonce = crypto.randomUUID(),
}) {
  const secret = clean(sharedSecret);
  const sender = clean(serviceId);
  const version = clean(contractVersion);
  if (!secret) throw boundaryError('ERP_INTEGRATION_SECRET_REQUIRED', 'ERP integration shared secret is required');
  if (!sender) throw boundaryError('ERP_INTEGRATION_SERVICE_ID_REQUIRED', 'ERP integration service id is required');
  if (!version) throw boundaryError('ERP_INTEGRATION_CONTRACT_REQUIRED', 'ERP integration contract version is required');

  const { canonical, contentSha256 } = canonicalPayload({ method, path, timestamp, nonce, bodyText });
  const signature = crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');

  return Object.freeze({
    'x-aksha-service-id': sender,
    'x-aksha-contract-version': version,
    'x-aksha-timestamp': String(timestamp),
    'x-aksha-nonce': String(nonce),
    'x-aksha-content-sha256': contentSha256,
    'x-aksha-signature': signature,
  });
}

module.exports = {
  sha256Hex,
  canonicalPayload,
  signServiceRequest,
};
