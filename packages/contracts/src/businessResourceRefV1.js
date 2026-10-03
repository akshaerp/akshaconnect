'use strict';

const { clean, requireText, normalizeCode } = require('./contractUtilsV1');

const BUSINESS_RESOURCE_REF_VERSION = '1.0';

function validateBusinessResourceRefV1(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['business resource reference must be an object'] };
  }

  requireText(input.provider, 'provider', errors);
  requireText(input.tenant_key, 'tenant_key', errors);
  requireText(input.resource_type, 'resource_type', errors);
  requireText(input.resource_key, 'resource_key', errors);

  if (input.contract_version && String(input.contract_version) !== BUSINESS_RESOURCE_REF_VERSION) {
    errors.push(`contract_version must be ${BUSINESS_RESOURCE_REF_VERSION}`);
  }

  if (input.deep_link !== undefined && input.deep_link !== null && !clean(input.deep_link)) {
    errors.push('deep_link must be non-empty when supplied');
  }

  return { ok: errors.length === 0, errors };
}

function assertBusinessResourceRefV1(input) {
  const result = validateBusinessResourceRefV1(input);
  if (!result.ok) {
    const error = new Error(`Invalid business resource reference: ${result.errors.join('; ')}`);
    error.code = 'AKSHACONNECT_INVALID_BUSINESS_RESOURCE_REF_V1';
    error.validationErrors = result.errors;
    throw error;
  }
  return input;
}

function createBusinessResourceRefV1(input = {}) {
  const value = {
    contract_version: BUSINESS_RESOURCE_REF_VERSION,
    provider: normalizeCode(input.provider),
    tenant_key: clean(input.tenant_key),
    organization_key: clean(input.organization_key),
    resource_type: normalizeCode(input.resource_type),
    resource_key: clean(input.resource_key),
    resource_label: clean(input.resource_label),
    deep_link: clean(input.deep_link),
  };
  return Object.freeze(assertBusinessResourceRefV1(value));
}

module.exports = {
  BUSINESS_RESOURCE_REF_VERSION,
  validateBusinessResourceRefV1,
  assertBusinessResourceRefV1,
  createBusinessResourceRefV1,
};
