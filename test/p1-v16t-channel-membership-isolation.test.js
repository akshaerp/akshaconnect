'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function source(...parts) {
  return fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');
}

test('V16-T channel list exposes only active channel memberships', () => {
  const repository = source('services', 'api', 'src', 'collaboration', 'collaborationRepository.js');
  assert.match(repository, /async function listChannels/);
  assert.match(repository, /AND cm\.workspace_member_id IS NOT NULL/);
  assert.doesNotMatch(repository, /c\.visibility = 'PUBLIC'[\s\S]{0,80}OR cm\.workspace_member_id IS NOT NULL/);
});

test('V16-T message history and unread counts require channel membership', () => {
  const repository = source('services', 'api', 'src', 'messaging', 'messagingRepository.js');
  assert.match(repository, /async function getConversationAccess/);
  assert.match(repository, /async function listUnreadCounts/);
  assert.doesNotMatch(repository, /ch\.visibility = 'PUBLIC' OR cm\.workspace_member_id IS NOT NULL/);
  const membershipChecks = repository.match(/AND cm\.workspace_member_id IS NOT NULL/g) || [];
  assert.ok(membershipChecks.length >= 2, 'history and unread access must both require membership');
});

test('V16-T public channels do not fan out realtime or push to the whole workspace', () => {
  const repository = source('services', 'api', 'src', 'messaging', 'messagingRepository.js');
  const start = repository.indexOf('async function listConversationRecipientMemberIds');
  const end = repository.indexOf('return Object.freeze', start);
  const recipientSource = repository.slice(start, end);
  assert.match(recipientSource, /JOIN ac_channel_member cm/);
  assert.match(recipientSource, /cm\.left_at IS NULL/);
  assert.doesNotMatch(recipientSource, /ch\.visibility = 'PUBLIC'/);
});

test('V16-T channel content surfaces require membership even for PUBLIC visibility', () => {
  const platform = source('services', 'api', 'src', 'collaboration', 'conversationPlatformService.js');
  assert.match(platform, /context\.channel_status !== 'ACTIVE'[\s\S]*!context\.requester_is_channel_member/);
  assert.doesNotMatch(platform, /context\.visibility === 'PRIVATE'[\s\S]{0,160}!context\.requester_is_channel_member/);

  const readers = source('services', 'api', 'src', 'messaging', 'messageReadersHttpHandler.js');
  assert.match(readers, /conv\.conversation_type = 'CHANNEL'[\s\S]*cm\.workspace_member_id IS NOT NULL/);
  assert.doesNotMatch(readers, /ch\.visibility = 'PUBLIC'/);
});

test('V16-T direct messages remain participant-only', () => {
  const repository = source('services', 'api', 'src', 'messaging', 'messagingRepository.js');
  assert.match(repository, /conv\.conversation_type IN \('DM', 'GROUP_DM'\)[\s\S]*cp\.workspace_member_id IS NOT NULL/);
});
