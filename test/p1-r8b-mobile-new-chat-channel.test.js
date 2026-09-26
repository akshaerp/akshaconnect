'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('R8B mobile API exposes member search, DM start and channel creation', () => {
  const api = read('apps/mobile/src/api/client.js');
  assert.match(api, /export function listWorkspaceMembers/);
  assert.match(api, /export function startDirectMessage/);
  assert.match(api, /export function createChannel/);
  assert.match(api, /channel_name:\s*channelName/);
  assert.match(api, /visibility,/);
});

test('R8B App wires mobile discovery actions into HomeScreen', () => {
  const app = read('apps/mobile/App.jsx');
  assert.match(app, /handleSearchWorkspaceMembers/);
  assert.match(app, /handleStartDirectMessage/);
  assert.match(app, /handleCreateChannel/);
  assert.match(app, /onSearchMembers=\{handleSearchWorkspaceMembers\}/);
  assert.match(app, /onStartDirectMessage=\{handleStartDirectMessage\}/);
  assert.match(app, /onCreateChannel=\{handleCreateChannel\}/);
});

test('R8B mobile HomeScreen exposes new chat people search and new channel creation', () => {
  const home = read('apps/mobile/src/screens/HomeScreen.jsx');
  assert.match(home, /\+ New chat/);
  assert.match(home, /\+ New channel/);
  assert.match(home, /Search by name or email/);
  assert.match(home, /Search chats/);
  assert.match(home, /Search channels/);
  assert.match(home, /Create channel/);
  assert.match(home, /channelVisibility/);
  assert.match(home, /onStartDirectMessage\(member\)/);
  assert.match(home, /onCreateChannel\(\{/);
});

test('R8B Android internal build advances to v11', () => {
  const gradle = read('apps/mobile/android/app/build.gradle');
  assert.match(gradle, /versionCode 11/);
  assert.match(gradle, /versionName "0\.3\.0-v11"/);
});
