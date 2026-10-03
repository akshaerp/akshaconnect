'use strict';

const { clean, requireText, normalizeCode } = require('./contractUtilsV1');

const PROVIDER_IDENTITY_LINK_VERSION = '1.0';

function validateProviderIdentityLinkV1(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['provider identity link must be an object'] };
  }

  requireText(input.person_id, 'person_id', errors);
  requireText(input.provider, 'provider', errors);
  requireText(input.provider_identity_type, 'provider_identity_type', errors);
  requireText(input.provider_identity_key, 'provider_identity_key', errors);

  if (input.contract_version && String(input.contract_version) !== PROVIDER_IDENTITY_LINK_VERSION) {
    errors.push(`contract_version must be ${PROVIDER_IDENTITY_LINK_VERSION}`);
  }

  return { ok: errors.length === 0, errors };
}

function assertProviderIdentityLinkV1(input) {
  const result = validateProviderIdentityLinkV1(input);
  if (!result.ok) {
    const error = new Error(`Invalid provider identity link: ${result.errors.join('; ')}`);
    error.code = 'AKSHACONNECT_INVALID_PROVIDER_IDENTITY_LINK_V1';
    error.validationErrors = result.errors;
    throw error;
  }
  return input;
}

function createProviderIdentityLinkV1(input = {}) {
  const value = {
    contract_version: PROVIDER_IDENTITY_LINK_VERSION,
    person_id: clean(input.person_id),
    provider: normalizeCode(input.provider),
    provider_tenant_key: clean(input.provider_tenant_key),
    provider_identity_type: normalizeCode(input.provider_identity_type),
    provider_identity_key: clean(input.provider_identity_key),
    status: normalizeCode(input.status) || 'ACTIVE',
  };
  return Object.freeze(assertProviderIdentityLinkV1(value));
}

module.exports = {
  PROVIDER_IDENTITY_LINK_VERSION,
  validateProviderIdentityLinkV1,
  assertProviderIdentityLinkV1,
  createProviderIdentityLinkV1,
};
