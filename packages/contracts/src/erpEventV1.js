'use strict';

const ERP_EVENT_CONTRACT_VERSION = '1.0';
const RECIPIENT_TYPES = new Set(['USER', 'ROLE', 'GROUP', 'CHANNEL']);
const SENDER_TYPES = new Set(['HUMAN', 'SYSTEM', 'MODULE', 'BOT']);

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function validateErpEventV1(event) {
  const errors = [];

  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return { ok: false, errors: ['event must be an object'] };
  }

  const required = [
    'event_id',
    'event_type',
    'tenant_id',
    'organization_id',
    'recipient_type',
    'sender_type',
    'sender_reference',
    'title',
    'summary',
    'correlation_id',
    'created_at',
  ];

  for (const field of required) {
    if (!hasValue(event[field])) errors.push(`${field} is required`);
  }

  if (hasValue(event.contract_version) && event.contract_version !== ERP_EVENT_CONTRACT_VERSION) {
    errors.push(`contract_version must be ${ERP_EVENT_CONTRACT_VERSION}`);
  }

  if (hasValue(event.recipient_type) && !RECIPIENT_TYPES.has(String(event.recipient_type).toUpperCase())) {
    errors.push('recipient_type is invalid');
  }

  if (!Array.isArray(event.recipient_ids) || event.recipient_ids.length === 0) {
    errors.push('recipient_ids must be a non-empty array');
  }

  if (hasValue(event.sender_type) && !SENDER_TYPES.has(String(event.sender_type).toUpperCase())) {
    errors.push('sender_type is invalid');
  }

  if (event.actions !== undefined && !Array.isArray(event.actions)) {
    errors.push('actions must be an array when supplied');
  }

  if (hasValue(event.created_at) && Number.isNaN(Date.parse(event.created_at))) {
    errors.push('created_at must be an ISO-compatible timestamp');
  }

  if (hasValue(event.expires_at) && Number.isNaN(Date.parse(event.expires_at))) {
    errors.push('expires_at must be an ISO-compatible timestamp when supplied');
  }

  return { ok: errors.length === 0, errors };
}

function assertErpEventV1(event) {
  const result = validateErpEventV1(event);
  if (!result.ok) {
    const error = new Error(`Invalid AkshaConnect ERP event: ${result.errors.join('; ')}`);
    error.code = 'AKSHACONNECT_INVALID_ERP_EVENT_V1';
    error.validationErrors = result.errors;
    throw error;
  }
  return event;
}

function createErpEventV1(input) {
  const event = {
    contract_version: ERP_EVENT_CONTRACT_VERSION,
    actions: [],
    ...input,
    recipient_type: String(input?.recipient_type || '').toUpperCase(),
    sender_type: String(input?.sender_type || '').toUpperCase(),
  };

  return assertErpEventV1(event);
}

module.exports = {
  ERP_EVENT_CONTRACT_VERSION,
  RECIPIENT_TYPES,
  SENDER_TYPES,
  validateErpEventV1,
  assertErpEventV1,
  createErpEventV1,
};
