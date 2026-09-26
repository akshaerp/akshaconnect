const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('R8C mobile draft store scopes drafts by identity, workspace and conversation', () => {
  const source = read('apps/mobile/src/drafts/draftStore.js');
  assert.match(source, /identityId/);
  assert.match(source, /workspaceId/);
  assert.match(source, /conversationId/);
  assert.match(source, /akshaconnect-drafts-v1\.json/);
  assert.match(source, /loadConversationDraft/);
  assert.match(source, /saveConversationDraft/);
  assert.match(source, /clearConversationDraft/);
});

test('R8C mobile restores, debounces, flushes and clears text drafts', () => {
  const source = read('apps/mobile/src/screens/ConversationScreen.jsx');
  assert.match(source, /loadConversationDraft\(draftScope\)/);
  assert.match(source, /saveConversationDraft\([\s\S]*draftRef\.current/);
  assert.match(source, /AppState\.addEventListener/);
  assert.match(source, /}, 300\);/);
  assert.match(source, /await clearConversationDraft\(draftScope\)\.catch/);
  assert.match(source, /handleDraftChange\(value\)/);
  assert.match(source, /draftUserChangedScopeRef/);
});

test('R8C web uses namespaced localStorage drafts and clears only after send success', () => {
  const store = read('apps/web/src/drafts.js');
  const app = read('apps/web/src/App.jsx');
  assert.match(store, /akshaconnect:draft:v1/);
  assert.match(store, /window\.localStorage\.getItem/);
  assert.match(store, /window\.localStorage\.setItem/);
  assert.match(store, /window\.localStorage\.removeItem/);
  assert.match(app, /setDraft\(loadConversationDraft\(draftScope\)\)/);
  assert.match(app, /saveConversationDraft\(draftScope, next\)/);
  assert.match(app, /Text was durably acknowledged[\s\S]*clearConversationDraft\(draftScope\);/);
  assert.match(app, /updateDraft\(event\.target\.value\)/);
});

test('R8C preserves the accepted V13 Android baseline and Play signing', () => {
  const gradle = read('apps/mobile/android/app/build.gradle');
  assert.match(gradle, /versionCode 13/);
  assert.match(gradle, /versionName "0\.3\.0-v13"/);
  assert.match(gradle, /AKSHACONNECT_UPLOAD_STORE_FILE/);
});
