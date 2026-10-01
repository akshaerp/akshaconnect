'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createMessageReadersHttpHandler,
} = require('../services/api/src/messaging/messageReadersHttpHandler');

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const SENDER_ID = '22222222-2222-4222-8222-222222222222';
const READER_ID = '33333333-3333-4333-8333-333333333333';
const CONVERSATION_ID = '44444444-4444-4444-8444-444444444444';
const MESSAGE_ID = '55555555-5555-4555-8555-555555555555';
const THREAD_ROOT_ID = '66666666-6666-4666-8666-666666666666';

function makeIdentityService() {
  return {
    async verifyAccessToken(token) {
      assert.equal(token, 'test-token');
      return {
        workspace_id: WORKSPACE_ID,
        workspace_member_id: SENDER_ID,
        identity_id: '77777777-7777-4777-8777-777777777777',
      };
    },
  };
}

function makeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers || {};
    },
    end(payload = '') {
      this.body = String(payload);
    },
  };
}

function makeRequest(path) {
  return {
    method: 'GET',
    url: path,
    headers: {
      authorization: 'Bearer test-token',
    },
  };
}

function makeDb({
  messageSenderId = SENDER_ID,
  replyToMessageId = null,
  readerRows = [],
} = {}) {
  const calls = [];

  return {
    calls,
    async query(sql, params) {
      const text = String(sql);
      calls.push({ text, params });

      if (text.includes('FROM ac_workspace_member wm') &&
          text.includes("wm.status = 'ACTIVE'") &&
          !text.includes('ac_read_cursor') &&
          !text.includes('ac_thread_read_cursor')) {
        return { rows: [{ workspace_member_id: SENDER_ID }] };
      }

      if (text.includes('FROM ac_conversation conv')) {
        return { rows: [{ conversation_id: CONVERSATION_ID }] };
      }

      if (text.includes('FROM ac_message') &&
          text.includes('sender_member_id') &&
          text.includes('deleted_at') &&
          !text.includes('cursor_message') &&
          !text.includes('cursor_reply')) {
        return {
          rows: [{
            message_id: MESSAGE_ID,
            sender_type: 'HUMAN',
            sender_member_id: messageSenderId,
            reply_to_message_id: replyToMessageId,
            created_at: '2026-09-29T12:00:00.000Z',
            deleted_at: null,
          }],
        };
      }

      if (text.includes('FROM ac_read_cursor rc')) {
        return { rows: readerRows };
      }

      if (text.includes('FROM ac_thread_read_cursor trc')) {
        return { rows: readerRows };
      }

      throw new Error(`Unexpected SQL in test: ${text.slice(0, 100)}`);
    },
  };
}

async function invoke(handler, path) {
  const req = makeRequest(path);
  const res = makeResponse();
  const handled = await handler(req, res);
  return {
    handled,
    status: res.statusCode,
    body: res.body ? JSON.parse(res.body) : null,
  };
}

test('V16-R handler returns only safe reader fields for an own main message', async () => {
  const db = makeDb({
    readerRows: [{
      display_name: 'Reader One',
      read_at: '2026-09-29T12:05:00.000Z',
      total_count: 1,
      workspace_member_id: READER_ID,
      primary_email: 'must-not-leak@example.invalid',
    }],
  });
  const handler = createMessageReadersHttpHandler({
    localIdentityService: makeIdentityService(),
    db,
  });

  const result = await invoke(
    handler,
    `/api/v1/conversations/${CONVERSATION_ID}/messages/${MESSAGE_ID}/readers?limit=50&offset=0`
  );

  assert.equal(result.handled, true);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.readers, [{
    display_name: 'Reader One',
    read_at: '2026-09-29T12:05:00.000Z',
  }]);
  assert.equal(result.body.total, 1);
  assert.equal(result.body.page.has_more, false);
  assert.equal(JSON.stringify(result.body).includes('primary_email'), false);
  assert.equal(JSON.stringify(result.body).includes(READER_ID), false);
  assert.equal(
    db.calls.some((call) => call.text.includes('FROM ac_read_cursor rc')),
    true
  );
});

test('V16-R handler uses thread cursor for an own thread reply', async () => {
  const db = makeDb({
    replyToMessageId: THREAD_ROOT_ID,
    readerRows: [{
      display_name: 'Reader Two',
      read_at: '2026-09-29T12:07:00.000Z',
      total_count: 1,
    }],
  });
  const handler = createMessageReadersHttpHandler({
    localIdentityService: makeIdentityService(),
    db,
  });

  const result = await invoke(
    handler,
    `/api/v1/conversations/${CONVERSATION_ID}/messages/${MESSAGE_ID}/readers`
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.readers[0].display_name, 'Reader Two');
  assert.equal(
    db.calls.some((call) => call.text.includes('FROM ac_thread_read_cursor trc')),
    true
  );
});

test('V16-R handler rejects reader details for a message not sent by requester', async () => {
  const db = makeDb({
    messageSenderId: READER_ID,
  });
  const handler = createMessageReadersHttpHandler({
    localIdentityService: makeIdentityService(),
    db,
  });

  const result = await invoke(
    handler,
    `/api/v1/conversations/${CONVERSATION_ID}/messages/${MESSAGE_ID}/readers`
  );

  assert.equal(result.status, 403);
  assert.equal(result.body.error.code, 'MESSAGE_READERS_NOT_ALLOWED');
});

test('V16-R handler rejects invalid pagination before touching data', async () => {
  const db = makeDb();
  const handler = createMessageReadersHttpHandler({
    localIdentityService: makeIdentityService(),
    db,
  });

  const result = await invoke(
    handler,
    `/api/v1/conversations/${CONVERSATION_ID}/messages/${MESSAGE_ID}/readers?limit=5000`
  );

  assert.equal(result.status, 400);
  assert.equal(result.body.error.code, 'MESSAGE_READERS_PAGE_INVALID');
  assert.equal(db.calls.length, 0);
});
