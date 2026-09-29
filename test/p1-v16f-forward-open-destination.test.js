'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('V16-F forward target retains DM identity and opens destination after success', () => {
  const mobile = read('apps/mobile/src/screens/ConversationScreen.jsx');
  assert.match(mobile, /otherWorkspaceMemberId:[\s\S]*other_workspace_member_id/);
  assert.match(mobile, /async function forwardMessageToTarget/);
  assert.match(mobile, /setConversation\(\{[\s\S]*\.\.\.target,[\s\S]*unreadAtOpen: 0/);
});

test('V16-F does not navigate before durable forward work finishes', () => {
  const mobile = read('apps/mobile/src/screens/ConversationScreen.jsx');
  const fn = mobile.slice(mobile.indexOf('async function forwardMessageToTarget'), mobile.indexOf('async function copyMessage'));
  assert.ok(fn.indexOf('await sendMessage') < fn.indexOf('setConversation({'));
  assert.ok(fn.indexOf('await uploadAttachment') < fn.indexOf('setConversation({'));
});
