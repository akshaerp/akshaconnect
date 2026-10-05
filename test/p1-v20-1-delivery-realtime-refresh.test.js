'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const parser = require('@babel/parser');

const root = path.resolve(__dirname, '..');
const read = (rel) =>
  fs.readFileSync(
    path.join(root, rel),
    'utf8'
  );

function parse(rel) {
  const source = read(rel);

  assert.doesNotThrow(() =>
    parser.parse(source, {
      sourceType: 'module',
      plugins: ['jsx', 'flow'],
    })
  );

  return source;
}

test('V20.1 first durable delivery receipt emits sender-only realtime event', () => {
  const handler = read(
    'services/api/src/messaging/messageReadersHttpHandler.js'
  );

  assert.match(
    handler,
    /message\.delivery\.updated/
  );

  assert.match(
    handler,
    /sender_workspace_member_id/
  );

  assert.match(
    handler,
    /DO NOTHING/
  );

  assert.match(
    handler,
    /if \(result\.created\)/
  );

  assert.doesNotMatch(
    handler,
    /delivered_workspace_member_id/
  );
});

test('V20.1 message reader handler receives the realtime event publisher', () => {
  const server = read(
    'services/api/src/server.js'
  );

  assert.match(
    server,
    /createMessageReadersHttpHandler\(\{[\s\S]*?eventPublisher:\s*realtimeEventBus/
  );
});

test('V20.1 realtime gateway sends delivery update only to original sender connection', () => {
  const gateway = read(
    'services/api/src/realtime/realtimeGateway.js'
  );

  assert.match(
    gateway,
    /event\.type ===\s*'message\.delivery\.updated'/
  );

  assert.match(
    gateway,
    /event\.sender_workspace_member_id/
  );

  assert.match(
    gateway,
    /workspace_member_id !==\s*targetMemberId/
  );

  const eventStart = gateway.indexOf(
    "'message.delivery.updated'"
  );
  const readStart = gateway.indexOf(
    "if (event.type === 'read_cursor.updated')",
    eventStart
  );
  const block = gateway.slice(
    eventStart,
    readStart
  );

  assert.doesNotMatch(
    block,
    /delivered_workspace_member_id/
  );
});

test('V20.1 mobile forwards delivery realtime event and silently refreshes Message Info', () => {
  const app = parse(
    'apps/mobile/App.jsx'
  );
  const conversation = parse(
    'apps/mobile/src/screens/ConversationScreen.jsx'
  );
  const thread = parse(
    'apps/mobile/src/screens/ThreadModal.jsx'
  );
  const info = parse(
    'apps/mobile/src/screens/MessageReadersModal.jsx'
  );

  assert.match(
    app,
    /deliveryReceiptEvent/
  );

  assert.match(
    app,
    /message\.delivery\.updated/
  );

  assert.match(
    conversation,
    /deliveryReceiptEvents/
  );

  assert.match(
    conversation,
    /setMessageReadersRefreshEpoch/
  );

  assert.match(
    thread,
    /message\.delivery\.updated/
  );

  assert.match(
    thread,
    /setMessageReadersRefreshEpoch/
  );

  assert.doesNotMatch(
    info,
    /setInterval\s*\(/
  );

  assert.match(
    info,
    /Delivery remains recorded after a recipient reads the message/
  );
});

test('V20.1 web replaces polling with delivery-event refresh in main chat and thread', () => {
  const app = parse(
    'apps/web/src/App.jsx'
  );
  const thread = parse(
    'apps/web/src/ThreadPanel.jsx'
  );
  const info = parse(
    'apps/web/src/MessageInfoDialog.jsx'
  );

  assert.match(
    app,
    /message\.delivery\.updated/
  );

  assert.match(
    app,
    /messageInfoRefreshEpoch/
  );

  assert.match(
    app,
    /refreshEpoch=\{[\s\S]*?messageInfoRefreshEpoch/
  );

  assert.match(
    thread,
    /message\.delivery\.updated/
  );

  assert.match(
    thread,
    /messageInfoRefreshEpoch/
  );

  assert.match(
    info,
    /refreshEpoch = 0/
  );

  assert.doesNotMatch(
    info,
    /setInterval\s*\(/
  );

  assert.match(
    info,
    /No recipient delivery confirmations yet/
  );

  assert.match(
    info,
    /Delivery remains recorded after a recipient reads the message/
  );
});
