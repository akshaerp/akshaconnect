'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const source = fs.readFileSync(
  'services/api/src/messaging/messageReadersHttpHandler.js',
  'utf8'
);

function functionBody(name, nextName) {
  const start = source.indexOf(`async function ${name}`);
  assert.ok(start >= 0, `${name} missing`);
  const end = source.indexOf(nextName, start);
  assert.ok(end > start, `${name} boundary missing`);
  return source.slice(start, end);
}

test('V20.1 Delivered is cumulative and does not exclude recipients after Read', () => {
  const delivered = functionBody(
    'listDeliveredReceipts',
    'function publicReader'
  );

  assert.match(
    delivered,
    /FROM ac_message_delivery_receipt dr/
  );

  assert.doesNotMatch(
    delivered,
    /NOT EXISTS/
  );

  assert.doesNotMatch(
    delivered,
    /ac_read_cursor/
  );

  assert.doesNotMatch(
    delivered,
    /ac_thread_read_cursor/
  );

  assert.match(
    delivered,
    /LIMIT \$5 OFFSET \$6/
  );
});

test('V20.1 Read remains independent from cumulative Delivered', () => {
  assert.match(source, /async function listMainMessageReaders/);
  assert.match(source, /async function listThreadMessageReaders/);
  assert.match(source, /FROM ac_read_cursor rc/);
  assert.match(source, /FROM ac_thread_read_cursor trc/);
});

test('V20.1 DELIVERED receipt route uses the cumulative delivery query for main and thread messages', () => {
  assert.match(
    source,
    /rows =\s*await listDeliveredReceipts\(\{/
  );

  assert.doesNotMatch(
    source,
    /listMainDeliveredUnread/
  );

  assert.doesNotMatch(
    source,
    /listThreadDeliveredUnread/
  );
});
