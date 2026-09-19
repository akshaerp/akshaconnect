const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('P1-V8A V2 routes channel and DM selections into a native conversation screen', () => {
  const app = read('apps/mobile/App.jsx');
  const home = read('apps/mobile/src/screens/HomeScreen.jsx');

  assert.match(app, /ConversationScreen/);
  assert.match(app, /selectedConversation/);
  assert.match(home, /onOpenConversation/);
  assert.match(home, /channel\.conversation_id/);
  assert.match(home, /dm\.conversation_id/);
});

test('P1-V8A V2 mobile client uses the existing durable messaging endpoints', () => {
  const client = read('apps/mobile/src/api/client.js');

  assert.match(
    client,
    /\/api\/v1\/conversations\/\$\{encodeURIComponent\(conversationId\)\}/
  );
  assert.match(client, /messages\?limit=/);
  assert.match(client, /body_text: bodyText/);
  assert.match(client, /client_message_id: clientMessageId/);
  assert.doesNotMatch(
    client,
    /sender_member_id|workspace_id\s*:|AKSHAERP_|module_code|function_code/i
  );
});

test('P1-V8A V2 conversation screen renders durable history and bounded pagination', () => {
  const screen = read(
    'apps/mobile/src/screens/ConversationScreen.jsx'
  );

  assert.match(screen, /listMessages/);
  assert.match(screen, /Load older messages/);
  assert.match(screen, /next_before_message_id/);
  assert.match(screen, /sender_display_name/);
  assert.match(screen, /created_at/);
  assert.match(screen, /Today/);
  assert.match(screen, /Yesterday/);
});

test('P1-V8A V2 sends idempotent text without fabricating delivery receipts', () => {
  const screen = read(
    'apps/mobile/src/screens/ConversationScreen.jsx'
  );

  assert.match(screen, /sendMessage/);
  assert.match(screen, /makeClientMessageId/);
  assert.match(screen, /MAX_MESSAGE_CHARS = 8000/);
  assert.match(screen, />\s*Send\s*</);

  const forbiddenReceiptPresentation = [
    />\s*Delivered\s*</i,
    />\s*Seen\s*</i,
    />\s*Read by\b/i,
    /['"`]Delivered['"`]/i,
    /['"`]Seen['"`]/i,
    /['"`]Read by\b/i,
    /double[- ]check/i,
  ];

  for (const pattern of forbiddenReceiptPresentation) {
    assert.doesNotMatch(screen, pattern);
  }
});

test('P1-V8A durable messaging continues to avoid plaintext session persistence', () => {
  const app = read('apps/mobile/App.jsx');
  const conversation = read(
    'apps/mobile/src/screens/ConversationScreen.jsx'
  );

  const combined = `${app}\n${conversation}`;

  assert.doesNotMatch(
    combined,
    /AsyncStorage|sessionStorage|localStorage/
  );
});
