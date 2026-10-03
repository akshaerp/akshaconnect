'use strict';

const { clean, requireText, normalizeCode } = require('./contractUtilsV1');

const BUSINESS_ACTION_ENVELOPE_VERSION = '1.0';

function validateBusinessActionEnvelopeV1(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['business action envelope must be an object'] };
  }

  requireText(input.action_request_id, 'action_request_id', errors);
  requireText(input.idempotency_key, 'idempotency_key', errors);
  requireText(input.action_code, 'action_code', errors);
  requireText(input.requested_by_person_id, 'requested_by_person_id', errors);
  requireText(input.requested_at, 'requested_at', errors);
  requireText(input.correlation_id, 'correlation_id', errors);

  if (!input.resource || typeof input.resource !== 'object' || Array.isArray(input.resource)) {
    errors.push('resource is required and must be an object');
  }

  if (input.contract_version && String(input.contract_version) !== BUSINESS_ACTION_ENVELOPE_VERSION) {
    errors.push(`contract_version must be ${BUSINESS_ACTION_ENVELOPE_VERSION}`);
  }

  if (input.requested_at && Number.isNaN(Date.parse(input.requested_at))) {
    errors.push('requested_at must be an ISO-compatible timestamp');
  }

  if (input.parameters !== undefined &&
      (input.parameters === null || typeof input.parameters !== 'object' || Array.isArray(input.parameters))) {
    errors.push('parameters must be an object when supplied');
  }

  return { ok: errors.length === 0, errors };
}

function assertBusinessActionEnvelopeV1(input) {
  const result = validateBusinessActionEnvelopeV1(input);
  if (!result.ok) {
    const error = new Error(`Invalid business action envelope: ${result.errors.join('; ')}`);
    error.code = 'AKSHACONNECT_INVALID_BUSINESS_ACTION_ENVELOPE_V1';
    error.validationErrors = result.errors;
    throw error;
  }
  return input;
}

function createBusinessActionEnvelopeV1(input = {}) {
  const value = {
    contract_version: BUSINESS_ACTION_ENVELOPE_VERSION,
    action_request_id: clean(input.action_request_id),
    idempotency_key: clean(input.idempotency_key),
    resource: input.resource || null,
    action_code: normalizeCode(input.action_code),
    parameters: input.parameters && typeof input.parameters === 'object' && !Array.isArray(input.parameters)
      ? { ...input.parameters }
      : {},
    requested_by_person_id: clean(input.requested_by_person_id),
    requested_at: clean(input.requested_at),
    correlation_id: clean(input.correlation_id),
  };
  return Object.freeze(assertBusinessActionEnvelopeV1(value));
}

module.exports = {
  BUSINESS_ACTION_ENVELOPE_VERSION,
  validateBusinessActionEnvelopeV1,
  assertBusinessActionEnvelopeV1,
  createBusinessActionEnvelopeV1,
};
