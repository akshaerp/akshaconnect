'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  ERP_EVENT_CONTRACT_VERSION,
  createErpEventV1,
  validateErpEventV1,
} = require('../packages/contracts/src');

function validSystemEvent() {
  return {
    event_id: 'evt-20260831-0001',
    event_type: 'REPORT_READY',
    tenant_id: 'VISALAANDHRA',
    organization_id: 11,
    branch_id: 16,
    recipient_type: 'USER',
    recipient_ids: [2],
    sender_type: 'SYSTEM',
    sender_reference: 'AKSHAERP',
    title: 'Daily circulation report',
    summary: 'The scheduled report is ready.',
    entity_type: 'REPORT',
    entity_id: 5001,
    actions: [
      { code: 'OPEN_REPORT', label: 'Open report' },
    ],
    deep_link: '/reports/5001',
    correlation_id: 'corr-20260831-0001',
    created_at: '2026-08-31T18:00:00+05:30',
  };
}

test('creates a versioned SystemSender ERP event', () => {
  const event = createErpEventV1(validSystemEvent());
  assert.equal(event.contract_version, ERP_EVENT_CONTRACT_VERSION);
  assert.equal(event.sender_type, 'SYSTEM');
  assert.equal(event.sender_reference, 'AKSHAERP');
  assert.deepEqual(event.recipient_ids, [2]);
});

test('tenant and organization context are mandatory', () => {
  const event = validSystemEvent();
  delete event.tenant_id;
  delete event.organization_id;
  const result = validateErpEventV1(event);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('tenant_id is required'));
  assert.ok(result.errors.includes('organization_id is required'));
});

test('recipient list cannot be empty', () => {
  const event = validSystemEvent();
  event.recipient_ids = [];
  const result = validateErpEventV1(event);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('recipient_ids must be a non-empty array'));
});

test('unknown sender type is rejected', () => {
  const event = validSystemEvent();
  event.sender_type = 'FAKE_HUMAN';
  const result = validateErpEventV1(event);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('sender_type is invalid'));
});
