# P1-V5 Acceptance

Base commit: `aa72447c07b050fd264bb42bb4ebca81c20ac4ca`

## Automated gate

Run:

```text
npm run verify
```

Expected:

- all historical P0/P1-V1..V4 tests remain green
- P1-V5 durable-messaging tests pass
- production web build passes
- no realtime transport is introduced before P1-V6

## Database gate

Confirm:

```sql
SELECT current_database();
```

Expected `akshaconnect`.

Run exactly once:

```text
database/migrations/202609012115__p1_v5_durable_messaging.sql
```

Then run:

```text
database/verification/verify_p1_v5_durable_messaging.sql
```

Expected key gates:

```text
p1_v5_message_table_gate              PASS
p1_v5_read_cursor_table_gate          PASS
p1_v5_system_sender_table_gate        PASS
p1_v5_human_idempotency_gate          PASS
p1_v5_system_idempotency_gate         PASS
p1_v5_same_conversation_reply_gate    PASS
p1_v5_same_conversation_cursor_gate   PASS
```

## Practical two-browser gate

1. Start API in LOCAL/NONE mode and start the web client.
2. Alice signs into normal browser; Bob signs into private browser.
3. Alice opens the existing Bob DM, confirms Enter sends and Shift+Enter inserts a new line, then sends a unique message.
4. Reload/refresh Alice and prove the message remains.
5. Bob opens the same Alice DM and clicks Refresh; Bob sees Alice's message.
6. Bob sends a reply.
7. Alice clicks Refresh and sees Bob's reply.
8. Refresh both browsers and prove both messages remain.
9. Test a public channel the same way.
10. Confirm no automatic cross-browser delivery occurs until Refresh; that is expected until P1-V6.

## Database runtime gate

Verify the two test messages exist once each in `ac_message`, HUMAN sender ids are Alice/Bob respectively, the conversation id is correct, and both users have same-conversation read cursors.

## P1-V5A security hardening

P1-V5 is not closed until the P1-V5A encryption-at-rest migration, verification and browser regression also pass. See `docs/testing/P1-V5A-ACCEPTANCE.md`.
