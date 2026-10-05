'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT =
  path.resolve(
    __dirname,
    '..'
  );

function read(rel) {
  return fs.readFileSync(
    path.join(
      ROOT,
      rel
    ),
    'utf8'
  );
}

test('V20.1 renders only structured mobile mentions as blue links', () => {
  const mention =
    read(
      'apps/mobile/src/screens/MentionText.jsx'
    );

  assert.match(
    mention,
    /splitMentionText/
  );
  assert.match(
    mention,
    /accessibilityRole=[\s\S]*'link'/
  );
  assert.match(
    mention,
    /onMentionPress[\s\S]*segment\.mention/
  );
  assert.match(
    mention,
    /colors\.primary/
  );
  assert.match(
    mention,
    /#62B5FF/
  );
});

test('V20.1 routes member mentions to DM and channel mentions to accessible channels', () => {
  const mobile =
    read(
      'apps/mobile/App.jsx'
    );
  const web =
    read(
      'apps/web/src/App.jsx'
    );

  for (
    const source of
    [mobile, web]
  ) {
    assert.match(
      source,
      /handleMentionNavigation/
    );
    assert.match(
      source,
      /mention_type/
    );
    assert.match(
      source,
      /target_id/
    );
  }

  assert.match(
    mobile,
    /handleStartDirectMessage/
  );
  assert.match(
    web,
    /handleStartDm/
  );
});

test('V20.1 records real per-recipient delivery acknowledgements', () => {
  const migration =
    read(
      'database/migrations/post_v1/acn/202610051300__acn_message_delivery_receipts_v20_1.sql'
    );

  const handler =
    read(
      'services/api/src/messaging/messageReadersHttpHandler.js'
    );

  assert.match(
    migration,
    /CREATE TABLE IF NOT EXISTS public\.ac_message_delivery_receipt/
  );
  assert.match(
    migration,
    /workspace_member_id UUID NOT NULL/
  );
  assert.match(
    migration,
    /delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/
  );

  assert.match(
    handler,
    /messages\\\/\(\[\^\/\]\+\)\\\/delivery/
  );
  assert.match(
    handler,
    /INSERT INTO ac_message_delivery_receipt/
  );
  assert.match(
    handler,
    /messages\\\/\(\[\^\/\]\+\)\\\/receipts/
  );
  assert.match(
    handler,
    /status must be READ or DELIVERED/
  );
});

test('V20.1 message info is available even when nobody has read yet', () => {
  const screen =
    read(
      'apps/mobile/src/screens/ConversationScreen.jsx'
    );
  const thread =
    read(
      'apps/mobile/src/screens/ThreadModal.jsx'
    );
  const mobileInfo =
    read(
      'apps/mobile/src/screens/MessageReadersModal.jsx'
    );
  const web =
    read(
      'apps/web/src/App.jsx'
    );
  const webInfo =
    read(
      'apps/web/src/MessageInfoDialog.jsx'
    );

  assert.doesNotMatch(
    screen,
    /own && !deleted && Number\(message\.read_by_count \|\| 0\) > 0/
  );
  assert.doesNotMatch(
    thread,
    /own && !deleted && Number\(message\.read_by_count \|\| 0\) > 0/
  );

  assert.match(
    screen,
    /ⓘ Info/
  );
  assert.match(
    thread,
    /ⓘ Info/
  );
  assert.match(
    mobileInfo,
    /Read by/
  );
  assert.match(
    mobileInfo,
    /Delivered to/
  );
  assert.match(
    web,
    /MessageInfoDialog/
  );
  assert.match(
    webInfo,
    /Read by/
  );
  assert.match(
    webInfo,
    /Delivered to/
  );
});

test('V20.1 delivery acknowledgements are sent by mobile and web clients', () => {
  const mobileApi =
    read(
      'apps/mobile/src/api/client.js'
    );
  const webApi =
    read(
      'apps/web/src/api.js'
    );
  const mobileApp =
    read(
      'apps/mobile/App.jsx'
    );
  const webApp =
    read(
      'apps/web/src/App.jsx'
    );

  assert.match(
    mobileApi,
    /markMessageDelivered/
  );
  assert.match(
    webApi,
    /markMessageDelivered/
  );
  assert.match(
    mobileApp,
    /markMessageDelivered/
  );
  assert.match(
    webApp,
    /markMessageDelivered/
  );
});
