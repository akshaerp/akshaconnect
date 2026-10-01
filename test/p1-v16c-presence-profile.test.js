'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('V16-C migration adds durable custom status and last seen profile', () => {
  const sql = read('database/migrations/post_v1/acn/202609281300__acn_presence_profile_v16_c.sql');
  assert.match(sql, /CREATE TABLE public\.ac_member_presence_profile/);
  assert.match(sql, /custom_status VARCHAR\(120\)/);
  assert.match(sql, /status_expires_at TIMESTAMPTZ/);
  assert.match(sql, /last_seen_at TIMESTAMPTZ/);
});

test('V16-C API exposes self and member presence profile routes', () => {
  const app = read('services/api/src/app.js');
  const service = read('services/api/src/messaging/messagingService.js');
  assert.match(app, /\/api\/v1\/presence\/me/);
  assert.match(app, /\/api\/v1\/presence\/members/);
  assert.match(service, /updateOwnPresenceProfile/);
  assert.match(service, /listPresenceProfiles/);
});

test('V16-C realtime presence publishes last seen and custom status', () => {
  const registry = read('services/api/src/realtime/presenceRegistry.js');
  const gateway = read('services/api/src/realtime/realtimeGateway.js');
  assert.match(registry, /custom_status/);
  assert.match(registry, /last_seen_at/);
  assert.match(gateway, /presence\.profile\.updated/);
  assert.match(gateway, /touchMemberLastSeen/);
});

test('V16-C mobile and web provide custom status with expiry and last seen display', () => {
  const mobileApi = read('apps/mobile/src/api/client.js');
  const mobileSettings = read('apps/mobile/src/screens/SettingsScreen.jsx');
  const mobileConversation = read('apps/mobile/src/screens/ConversationScreen.jsx');
  const mobileHome = read('apps/mobile/src/screens/HomeScreen.jsx');
  const webApi = read('apps/web/src/api.js');
  const web = read('apps/web/src/App.jsx');
  assert.match(mobileApi, /updateOwnPresenceProfile/);
  assert.match(mobileSettings, /Save status/);
  assert.match(mobileSettings, /statusExpiresAt/);
  assert.match(mobileSettings, /AkshaConnectDateTimePicker/);
  assert.match(mobileSettings, /openCustomExpiryPicker/);
  assert.match(mobileSettings, /Choose date & time/);
  assert.match(mobileConversation, /Last seen/);
  assert.match(mobileConversation, /peerCustomStatus/);
  assert.match(mobileHome, /presenceProfilesByMember/);
  assert.match(mobileHome, /custom_status/);
  assert.match(webApi, /updateOwnPresenceProfile/);
  assert.match(web, /Your status/);
  assert.match(web, /Last seen/);
});
