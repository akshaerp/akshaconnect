'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createMessagingRepository,
} = require('../services/api/src/messaging/messagingRepository');

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const CONVERSATION_ID = '22222222-2222-4222-8222-222222222222';
const MEMBER_ID = '33333333-3333-4333-8333-333333333333';
const BEFORE_MESSAGE_ID = '44444444-4444-4444-8444-444444444444';
const BEFORE_CREATED_AT = new Date('2026-09-28T12:00:00.000Z');

function createCryptoStub() {
  return {
    encryptText() {
      throw new Error('encryptText must not be called by history tests');
    },
    decryptText() {
      throw new Error('decryptText must not be called because history rows are empty');
    },
  };
}

function placeholderNumbers(sql) {
  return [...new Set(
    [...String(sql).matchAll(/\$(\d+)/g)]
      .map((match) => Number(match[1]))
  )].sort((a, b) => a - b);
}

function assertContiguousPlaceholders(call, label) {
  const refs = placeholderNumbers(call.sql);
  assert.ok(refs.length > 0, `${label}: expected SQL placeholders`);

  const max = Math.max(...refs);
  const expected = Array.from({ length: max }, (_, index) => index + 1);

  assert.deepEqual(
    refs,
    expected,
    `${label}: SQL placeholders must be contiguous from $1 through $${max}`
  );

  assert.equal(
    call.params.length,
    max,
    `${label}: parameter array length must match highest SQL placeholder`
  );
}

function isCursorLookup(sql) {
  const text = String(sql);
  return (
    text.includes('SELECT message_id, created_at') &&
    text.includes('message_id = $3') &&
    text.includes('reply_to_message_id IS NULL')
  );
}

function isHistoryQuery(sql) {
  const text = String(sql);
  return (
    text.includes('AS thread_unread_count') &&
    text.includes('FROM ac_message m') &&
    text.includes('m.reply_to_message_id IS NULL')
  );
}

function createDb({ cursorRow = null } = {}) {
  const calls = [];

  return {
    calls,

    connect() {
      throw new Error('db.connect must not be called by listMessages history tests');
    },

    async query(sql, params = []) {
      const call = {
        sql: String(sql),
        params: [...params],
      };
      calls.push(call);

      if (isCursorLookup(call.sql)) {
        return {
          rows: cursorRow ? [cursorRow] : [],
        };
      }

      if (isHistoryQuery(call.sql)) {
        return { rows: [] };
      }

      return { rows: [] };
    },
  };
}

test('V16 history initial load uses contiguous PostgreSQL parameter numbers', async () => {
  const db = createDb();
  const repository = createMessagingRepository(db, {
    messageCrypto: createCryptoStub(),
  });

  const page = await repository.listMessages({
    workspaceId: WORKSPACE_ID,
    conversationId: CONVERSATION_ID,
    workspaceMemberId: MEMBER_ID,
    limit: 50,
    beforeMessageId: null,
  });

  assert.equal(page.cursorInvalid, false);
  assert.deepEqual(page.rows, []);

  const historyCall = db.calls.find((call) => isHistoryQuery(call.sql));
  assert.ok(historyCall, 'expected root history query');

  assertContiguousPlaceholders(historyCall, 'initial history');

  assert.equal(historyCall.params.length, 6);
  assert.equal(historyCall.params[0], WORKSPACE_ID);
  assert.equal(historyCall.params[1], CONVERSATION_ID);
  assert.equal(historyCall.params[2], 51);
  assert.equal(historyCall.params[3], null);
  assert.equal(historyCall.params[4], null);
  assert.equal(historyCall.params[5], MEMBER_ID);

  assert.match(
    historyCall.sql,
    /\$4::timestamptz\s+IS\s+NULL/,
    'initial history must type and consume cursor timestamp parameter $4'
  );
  assert.match(
    historyCall.sql,
    /\$5::uuid\s+IS\s+NULL/,
    'initial history must type and consume cursor message parameter $5'
  );
  assert.match(
    historyCall.sql,
    /trc\.workspace_member_id\s*=\s*\$6/,
    'thread read state must keep member parameter at $6'
  );
});

test('V16 history cursor page keeps $4/$5 cursor and $6 member bindings contiguous', async () => {
  const db = createDb({
    cursorRow: {
      message_id: BEFORE_MESSAGE_ID,
      created_at: BEFORE_CREATED_AT,
    },
  });

  const repository = createMessagingRepository(db, {
    messageCrypto: createCryptoStub(),
  });

  const page = await repository.listMessages({
    workspaceId: WORKSPACE_ID,
    conversationId: CONVERSATION_ID,
    workspaceMemberId: MEMBER_ID,
    limit: 50,
    beforeMessageId: BEFORE_MESSAGE_ID,
  });

  assert.equal(page.cursorInvalid, false);
  assert.deepEqual(page.rows, []);

  const cursorCall = db.calls.find((call) => isCursorLookup(call.sql));
  assert.ok(cursorCall, 'expected cursor lookup');
  assert.deepEqual(
    cursorCall.params,
    [WORKSPACE_ID, CONVERSATION_ID, BEFORE_MESSAGE_ID]
  );

  const historyCall = db.calls.find((call) => isHistoryQuery(call.sql));
  assert.ok(historyCall, 'expected paginated root history query');

  assertContiguousPlaceholders(historyCall, 'cursor history');

  assert.equal(historyCall.params.length, 6);
  assert.equal(historyCall.params[0], WORKSPACE_ID);
  assert.equal(historyCall.params[1], CONVERSATION_ID);
  assert.equal(historyCall.params[2], 51);
  assert.equal(historyCall.params[3], BEFORE_CREATED_AT);
  assert.equal(historyCall.params[4], BEFORE_MESSAGE_ID);
  assert.equal(historyCall.params[5], MEMBER_ID);

  assert.match(
    historyCall.sql,
    /\(m\.created_at,\s*m\.message_id\)\s*<\s*\(\$4::timestamptz,\s*\$5::uuid\)/,
    'cursor history must retain tuple pagination using $4/$5'
  );
  assert.match(
    historyCall.sql,
    /trc\.workspace_member_id\s*=\s*\$6/,
    'cursor history must retain member parameter at $6'
  );
});
