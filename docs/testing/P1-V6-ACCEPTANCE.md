# P1-V6 Acceptance

Base Git checkpoint: `8acfc13288e4033041e02188860df280b956124c`

Version: `0.12.0-phase1`

## Automated gate

Run from the repository root:

```text
npm install
npm run verify
```

All historical P0/P1 tests must remain green together with the new P1-V6 realtime tests and the production web build.

## Practical two-browser gate

Use Alice in the normal browser and Bob in a private/incognito browser.

1. Both clients show realtime status as connected.
2. Alice opens Bob DM and sends a unique message.
3. Bob sees the message without Refresh or navigation.
4. Bob replies and Alice sees it without Refresh.
5. Alice stays in one conversation while Bob sends to a different DM/channel; Alice's corresponding sidebar unread badge increments.
6. Alice opens that conversation; the badge clears after the read cursor advances.
7. An incoming message from the other user produces the notification sound and in-app toast.
8. Sending your own message does not produce the incoming notification sound.
9. Repeat the same checks in `P1 V4 Browser Test` channel.
10. Stop/restart the API or briefly disconnect a browser, then reconnect. The selected conversation and unread state reconcile from durable APIs and no duplicate message is displayed.

## Encryption regression

After creating new realtime messages, direct SQL must still have no `body_text` column. New rows must contain:

```text
body_ciphertext        NOT NULL for TEXT messages
body_nonce             12 bytes
body_auth_tag          16 bytes
body_key_id            configured key id
body_encryption_version = 1
```

Realtime does not change P1-V5A ciphertext-only persistence.

## Expected limitation

P1-V6 is a single API-node realtime gateway. Cross-node fan-out is not claimed yet. Durable recovery ensures a missed socket event does not lose a message.
