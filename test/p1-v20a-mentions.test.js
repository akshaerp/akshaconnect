'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('V20-A stores durable member and channel mentions', () => {
  const sql = read('database/migrations/post_v1/acn/202610050800__acn_message_mentions_v20_a.sql');
  const repo = read('services/api/src/messaging/messagingRepository.js');
  const service = read('services/api/src/messaging/messagingService.js');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.ac_message_mention/);
  assert.match(sql, /mention_type IN \('MEMBER','CHANNEL'\)/);
  assert.match(repo, /decorateMentions/);
  assert.match(repo, /listMentionCandidates/);
  assert.match(service, /validateMentionTargets/);
});

test('V20-A exposes secure mention autocomplete and clients send mention ids', () => {
  const app = read('services/api/src/app.js');
  const mobileApi = read('apps/mobile/src/api/client.js');
  const webApi = read('apps/web/src/api.js');
  const mobile = read('apps/mobile/src/screens/ConversationScreen.jsx');
  const thread = read('apps/mobile/src/screens/ThreadModal.jsx');
  const web = read('apps/web/src/App.jsx');
  assert.match(app, /mention-candidates/);
  assert.match(mobileApi, /searchMentionCandidates/);
  assert.match(webApi, /searchMentionCandidates/);
  assert.match(mobile, /MentionSuggestions/);
  assert.match(thread, /MentionSuggestions/);
  assert.match(web, /mention-suggestions/);
});

test('V20-A distinguishes direct mention notifications', () => {
  const push = read('services/api/src/push/pushDeliveryService.js');
  assert.match(push, /mentioned you/);
  assert.match(push, /target_workspace_member_id/);
});
