'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) =>
  fs.readFileSync(path.join(root, relative), 'utf8');

test('V16-A adds a dedicated quoted-reply relation separate from threads', () => {
  const migration = read(
    'database/migrations/post_v1/acn/202609281000__acn_quoted_reply_v16_a.sql'
  );
  const repository = read(
    'services/api/src/messaging/messagingRepository.js'
  );
  const service = read(
    'services/api/src/messaging/messagingService.js'
  );

  assert.match(migration, /ADD COLUMN quote_message_id UUID/);
  assert.match(migration, /CONSTRAINT fk_ac_message_quote/);
  assert.match(migration, /ck_ac_message_quote_not_self/);
  assert.match(repository, /quote_message_id/);
  assert.match(repository, /quoted_message/);
  assert.match(service, /quoteMessageId/);
  assert.match(service, /MESSAGE_QUOTE_INVALID/);
  assert.match(service, /MESSAGE_REPLY_MODE_CONFLICT/);
});

test('V16-A preserves thread reply_to_message_id semantics', () => {
  const repository = read(
    'services/api/src/messaging/messagingRepository.js'
  );
  const service = read(
    'services/api/src/messaging/messagingService.js'
  );

  assert.match(repository, /m\.reply_to_message_id IS NULL/);
  assert.match(repository, /thread_reply_count/);
  assert.match(service, /MESSAGE_REPLY_NESTED_INVALID/);
  assert.match(
    service,
    /either reply_to_message_id for a thread reply or quote_message_id for a quoted reply/
  );
});

test('V16-A text and attachment clients transport quote_message_id', () => {
  const app = read('services/api/src/app.js');
  const attachmentService = read(
    'services/api/src/attachments/attachmentService.js'
  );
  const attachmentRepository = read(
    'services/api/src/attachments/attachmentRepository.js'
  );
  const mobileApi = read('apps/mobile/src/api/client.js');
  const webApi = read('apps/web/src/api.js');

  assert.match(app, /x-quote-message-id/);
  assert.match(attachmentService, /quoteMessageId/);
  assert.match(attachmentRepository, /quote_message_id/);
  assert.match(mobileApi, /quote_message_id:\s*quoteMessageId/);
  assert.match(mobileApi, /x-quote-message-id/);
  assert.match(webApi, /quote_message_id:\s*quoteMessageId/);
  assert.match(webApi, /x-quote-message-id/);
});

test('V16-A exposes distinct Reply and Reply in thread actions on mobile and web', () => {
  const mobile = read(
    'apps/mobile/src/screens/ConversationScreen.jsx'
  );
  const web = read('apps/web/src/App.jsx');
  const css = read('apps/web/src/styles.css');

  assert.match(mobile, /key:\s*'reply'/);
  assert.match(mobile, /label:\s*'Reply'/);
  assert.match(mobile, /label:\s*'Reply in thread'/);
  assert.match(mobile, /quoteReplyMessage/);
  assert.match(mobile, /message\.quoted_message/);

  assert.match(web, /aria-label="Reply"/);
  assert.match(web, /aria-label="Reply in thread"/);
  assert.match(web, /quoteReplyMessage/);
  assert.match(web, /message\.quoted_message/);
  assert.match(css, /\.composer-quoted-reply/);
  assert.match(css, /\.quoted-message/);
});

test('V16-A service validator carries quote ids and rejects mixed reply modes', () => {
  const service = read(
    'services/api/src/messaging/messagingService.js'
  );

  assert.match(
    service,
    /const quoteMessageId = clean\(input\.quote_message_id \?\? input\.quoteMessageId\) \|\| null/
  );
  assert.match(
    service,
    /replyToMessageId && quoteMessageId/
  );
  assert.match(
    service,
    /quoteMessageId:\s*message\.quoteMessageId/
  );
  assert.match(
    service,
    /sameNullable\(existing\.quote_message_id,\s*message\.quoteMessageId\)/
  );
});
