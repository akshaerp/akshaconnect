'use strict';

const { boundaryError } = require('../core/boundaryError');
const {
  IDENTITY_PROVIDERS,
  BUSINESS_PROVIDERS,
} = require('../../../../packages/contracts/src/providerModesV1');

function clean(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().toUpperCase();
  return text || null;
}

function isEnabled(value) {
  return ['Y', 'YES', 'TRUE', '1', 'ON'].includes(clean(value) || '');
}

function requireAllowed(value, allowedValues, code, label) {
  if (!allowedValues.includes(value)) {
    throw boundaryError(code, `${label} must be one of: ${allowedValues.join(', ')}`);
  }
  return value;
}

function resolveProviderConfiguration(env = {}) {
  const explicitIdentity = clean(env.AKSHACONNECT_IDENTITY_PROVIDER);
  const explicitBusiness = clean(env.AKSHACONNECT_BUSINESS_PROVIDER);
  const legacyErpEnabled = isEnabled(env.AKSHACONNECT_ERP_INTEGRATION_ENABLED);

  if (!explicitIdentity && !explicitBusiness) {
    return Object.freeze({
      mode: 'LEGACY_V4',
      identity_provider: legacyErpEnabled ? IDENTITY_PROVIDERS.AKSHAERP : 'DISABLED',
      business_provider: legacyErpEnabled ? BUSINESS_PROVIDERS.AKSHAERP : BUSINESS_PROVIDERS.NONE,
      standalone_mode: false,
      erp_required: legacyErpEnabled,
    });
  }

  const identityProvider = requireAllowed(
    explicitIdentity || IDENTITY_PROVIDERS.LOCAL,
    Object.values(IDENTITY_PROVIDERS),
    'IDENTITY_PROVIDER_INVALID',
    'AKSHACONNECT_IDENTITY_PROVIDER'
  );
  const businessProvider = requireAllowed(
    explicitBusiness || BUSINESS_PROVIDERS.NONE,
    Object.values(BUSINESS_PROVIDERS),
    'BUSINESS_PROVIDER_INVALID',
    'AKSHACONNECT_BUSINESS_PROVIDER'
  );

  if (
    identityProvider === IDENTITY_PROVIDERS.LOCAL &&
    businessProvider === BUSINESS_PROVIDERS.AKSHAERP
  ) {
    throw boundaryError(
      'PROVIDER_COMBINATION_UNSUPPORTED',
      'LOCAL identity cannot execute AkshaERP business operations until a trusted actor mapping exists',
      500
    );
  }

  return Object.freeze({
    mode: 'PROVIDER_V1',
    identity_provider: identityProvider,
    business_provider: businessProvider,
    standalone_mode:
      identityProvider === IDENTITY_PROVIDERS.LOCAL &&
      businessProvider === BUSINESS_PROVIDERS.NONE,
    erp_required:
      identityProvider === IDENTITY_PROVIDERS.AKSHAERP ||
      businessProvider === BUSINESS_PROVIDERS.AKSHAERP,
  });
}

module.exports = {
  isEnabled,
  resolveProviderConfiguration,
};
