'use strict';

const { clean, requireText } = require('./contractUtilsV1');

const INTEGRATION_REQUEST_CONTEXT_VERSION = '1.0';

function validateIntegrationRequestContextV1(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['integration request context must be an object'] };
  }

  requireText(input.request_id, 'request_id', errors);
  requireText(input.correlation_id, 'correlation_id', errors);
  requireText(input.person_id, 'person_id', errors);
  requireText(input.workspace_id, 'workspace_id', errors);

  if (input.contract_version && String(input.contract_version) !== INTEGRATION_REQUEST_CONTEXT_VERSION) {
    errors.push(`contract_version must be ${INTEGRATION_REQUEST_CONTEXT_VERSION}`);
  }

  return { ok: errors.length === 0, errors };
}

function assertIntegrationRequestContextV1(input) {
  const result = validateIntegrationRequestContextV1(input);
  if (!result.ok) {
    const error = new Error(`Invalid integration request context: ${result.errors.join('; ')}`);
    error.code = 'AKSHACONNECT_INVALID_INTEGRATION_REQUEST_CONTEXT_V1';
    error.validationErrors = result.errors;
    throw error;
  }
  return input;
}

function createIntegrationRequestContextV1(input = {}) {
  const value = {
    contract_version: INTEGRATION_REQUEST_CONTEXT_VERSION,
    request_id: clean(input.request_id),
    correlation_id: clean(input.correlation_id),
    idempotency_key: clean(input.idempotency_key),
    person_id: clean(input.person_id),
    workspace_id: clean(input.workspace_id),
    tenant_key: clean(input.tenant_key),
    organization_key: clean(input.organization_key),
    provider_identity: input.provider_identity || null,
    resource: input.resource || null,
    capability: clean(input.capability),
  };
  return Object.freeze(assertIntegrationRequestContextV1(value));
}

module.exports = {
  INTEGRATION_REQUEST_CONTEXT_VERSION,
  validateIntegrationRequestContextV1,
  assertIntegrationRequestContextV1,
  createIntegrationRequestContextV1,
};
