'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('V16-J migration creates one reaction slot per member and message', () => {
  const sql = read('database/migrations/post_v1/acn/202609281730__acn_message_reactions_v16_j.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.ac_message_reaction/);
  assert.match(sql, /PRIMARY KEY[\s\S]*workspace_member_id/);
  assert.match(sql, /'👍','❤️','😂','🎉','👀','✅'/);
});

test('V16-J API toggles reactions and exposes reactors', () => {
  const app = read('services/api/src/app.js');
  const service = read('services/api/src/messaging/messagingService.js');
  const repo = read('services/api/src/messaging/messagingRepository.js');
  assert.match(app, /messages\\\/\(\[\^\/\]\+\)\\\/reactions/);
  assert.match(service, /toggleMessageReaction/);
  assert.match(service, /message\.reaction\.updated/);
  assert.match(repo, /ON CONFLICT \(workspace_id, conversation_id, message_id, workspace_member_id\)/);
  assert.match(repo, /listMessageReactionUsers/);
});

test('V16-J mobile and web render reaction chips', () => {
  assert.match(read('apps/mobile/src/screens/ConversationScreen.jsx'), /reactionChip/);
  assert.match(read('apps/web/src/App.jsx'), /reaction-chip/);
});


test('V17-C1 reaction updates fan out in realtime and update the open mobile conversation', () => {
  const gateway =
    read(
      'services/api/src/realtime/realtimeGateway.js'
    );

  const app =
    read(
      'apps/mobile/App.jsx'
    );

  const mobile =
    read(
      'apps/mobile/src/screens/ConversationScreen.jsx'
    );

  assert.match(
    gateway,
    /event\.type === 'message\.reaction\.updated'/
  );

  assert.match(
    gateway,
    /message_id:\s*event\.message_id/
  );

  assert.match(
    gateway,
    /Array\.isArray\(event\.reactions\)/
  );

  assert.match(
    app,
    /const reactionEvent/
  );

  assert.match(
    app,
    /payload\?\.type ===[\s\S]*'message\.reaction\.updated'/
  );

  assert.match(
    mobile,
    /const reactionEvents = pending/
  );

  assert.match(
    mobile,
    /latestByMessageId/
  );

  assert.match(
    mobile,
    /reactions:[\s\S]*latestByMessageId\.get/
  );
});
