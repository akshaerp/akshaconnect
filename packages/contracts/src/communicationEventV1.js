'use strict';

const { clean, requireText, normalizeCode } = require('./contractUtilsV1');

const COMMUNICATION_EVENT_VERSION = '1.0';

const COMMUNICATION_EVENT_TYPES = Object.freeze([
  'MESSAGE_CREATED',
  'FILE_SHARED',
  'VOICE_MESSAGE_CREATED',
  'CALL_STARTED',
  'CALL_ENDED',
  'VIDEO_STARTED',
  'VIDEO_ENDED',
  'SCREEN_SHARE_STARTED',
  'SCREEN_SHARE_ENDED',
  'BUSINESS_ACTION_REQUESTED',
  'BUSINESS_ACTION_COMPLETED',
  'BUSINESS_ACTION_FAILED',
]);

function validateCommunicationEventV1(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['communication event must be an object'] };
  }

  requireText(input.event_id, 'event_id', errors);
  requireText(input.event_type, 'event_type', errors);
  requireText(input.occurred_at, 'occurred_at', errors);
  requireText(input.workspace_id, 'workspace_id', errors);
  requireText(input.correlation_id, 'correlation_id', errors);

  if (input.contract_version && String(input.contract_version) !== COMMUNICATION_EVENT_VERSION) {
    errors.push(`contract_version must be ${COMMUNICATION_EVENT_VERSION}`);
  }

  const eventType = normalizeCode(input.event_type);
  if (eventType && !COMMUNICATION_EVENT_TYPES.includes(eventType)) {
    errors.push('event_type is invalid');
  }

  if (input.occurred_at && Number.isNaN(Date.parse(input.occurred_at))) {
    errors.push('occurred_at must be an ISO-compatible timestamp');
  }

  if (input.resource_refs !== undefined && !Array.isArray(input.resource_refs)) {
    errors.push('resource_refs must be an array when supplied');
  }

  return { ok: errors.length === 0, errors };
}

function assertCommunicationEventV1(input) {
  const result = validateCommunicationEventV1(input);
  if (!result.ok) {
    const error = new Error(`Invalid communication event: ${result.errors.join('; ')}`);
    error.code = 'AKSHACONNECT_INVALID_COMMUNICATION_EVENT_V1';
    error.validationErrors = result.errors;
    throw error;
  }
  return input;
}

function createCommunicationEventV1(input = {}) {
  const value = {
    contract_version: COMMUNICATION_EVENT_VERSION,
    event_id: clean(input.event_id),
    event_type: normalizeCode(input.event_type),
    occurred_at: clean(input.occurred_at),
    workspace_id: clean(input.workspace_id),
    context_id: clean(input.context_id),
    conversation_id: clean(input.conversation_id),
    actor_person_id: clean(input.actor_person_id),
    resource_refs: Array.isArray(input.resource_refs) ? [...input.resource_refs] : [],
    payload_ref: input.payload_ref && typeof input.payload_ref === 'object' ? { ...input.payload_ref } : null,
    correlation_id: clean(input.correlation_id),
  };
  return Object.freeze(assertCommunicationEventV1(value));
}

module.exports = {
  COMMUNICATION_EVENT_VERSION,
  COMMUNICATION_EVENT_TYPES,
  validateCommunicationEventV1,
  assertCommunicationEventV1,
  createCommunicationEventV1,
};
