'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createBusinessResourceRefV1,
  createProviderIdentityLinkV1,
  createIntegrationRequestContextV1,
  createCommunicationEventV1,
  createBusinessActionEnvelopeV1,
  COMMUNICATION_EVENT_TYPES,
} = require('../packages/contracts/src');

test('BCP001-B01 creates a provider-neutral business resource reference', () => {
  const resource = createBusinessResourceRefV1({
    provider: 'akshaerp',
    tenant_key: 'TENANT-A',
    organization_key: '11',
    resource_type: 'project_task',
    resource_key: '1042',
    resource_label: 'QA task 1042',
    deep_link: '/projects/tasks/1042',
  });

  assert.equal(resource.provider, 'AKSHAERP');
  assert.equal(resource.resource_type, 'PROJECT_TASK');
  assert.equal(resource.resource_key, '1042');
});

test('BCP001-B01 creates a provider identity link without ERP-table coupling', () => {
  const link = createProviderIdentityLinkV1({
    person_id: 'person-1',
    provider: 'AKSHAERP',
    provider_tenant_key: 'TENANT-A',
    provider_identity_type: 'employee',
    provider_identity_key: '2',
  });

  assert.equal(link.provider_identity_type, 'EMPLOYEE');
  assert.equal(link.status, 'ACTIVE');
});

test('BCP001-B01 integration request context requires person/workspace trace context', () => {
  const context = createIntegrationRequestContextV1({
    request_id: 'req-1',
    correlation_id: 'corr-1',
    idempotency_key: 'idem-1',
    person_id: 'person-1',
    workspace_id: 'workspace-1',
  });

  assert.equal(context.request_id, 'req-1');
  assert.equal(context.workspace_id, 'workspace-1');
});

test('BCP001-B01 communication event taxonomy includes future communication modes', () => {
  for (const type of [
    'MESSAGE_CREATED',
    'FILE_SHARED',
    'CALL_STARTED',
    'VIDEO_STARTED',
    'SCREEN_SHARE_STARTED',
    'BUSINESS_ACTION_REQUESTED',
  ]) {
    assert.equal(COMMUNICATION_EVENT_TYPES.includes(type), true);
  }

  const event = createCommunicationEventV1({
    event_id: 'event-1',
    event_type: 'screen_share_started',
    occurred_at: '2026-10-03T10:00:00+05:30',
    workspace_id: 'workspace-1',
    context_id: 'context-1',
    correlation_id: 'corr-1',
  });

  assert.equal(event.event_type, 'SCREEN_SHARE_STARTED');
});

test('BCP001-B01 business action envelope carries idempotency and resource reference', () => {
  const resource = createBusinessResourceRefV1({
    provider: 'AKSHAERP',
    tenant_key: 'TENANT-A',
    resource_type: 'PROJECT_TASK',
    resource_key: '1042',
  });

  const action = createBusinessActionEnvelopeV1({
    action_request_id: 'action-1',
    idempotency_key: 'idem-action-1',
    resource,
    action_code: 'complete',
    parameters: {},
    requested_by_person_id: 'person-1',
    requested_at: '2026-10-03T10:00:00+05:30',
    correlation_id: 'corr-1',
  });

  assert.equal(action.action_code, 'COMPLETE');
  assert.equal(action.idempotency_key, 'idem-action-1');
});

test('BCP001-B01 rejects invalid normalized communication event types', () => {
  assert.throws(() => createCommunicationEventV1({
    event_id: 'event-2',
    event_type: 'UNKNOWN_EVENT',
    occurred_at: '2026-10-03T10:00:00+05:30',
    workspace_id: 'workspace-1',
    correlation_id: 'corr-2',
  }), /event_type is invalid/);
});
