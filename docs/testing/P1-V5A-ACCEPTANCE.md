# P1-V5A Acceptance

Base Git checkpoint: `aa72447c07b050fd264bb42bb4ebca81c20ac4ca`
Apply over the verified but uncommitted P1-V5 durable-messaging working tree.

## Automated gate

Run `npm run verify` after applying the P1-V5A code package. The P1-V5A encryption tests must pass together with all historical P0/P1 tests and the production web build.

## Key gate

Generate a random 32-byte development key locally. Never paste the key into chat and never commit it.

Required runtime variables:

```text
AKSHACONNECT_MESSAGE_ENCRYPTION_KEY_ID
AKSHACONNECT_MESSAGE_ENCRYPTION_KEY_B64
```

The same key must be used for the existing-message backfill and later API runtime or those encrypted messages cannot be decrypted.

## Database migration order

Confirm `SELECT current_database();` returns `akshaconnect`.

Run:

```text
database/migrations/202609012300__p1_v5a_message_encryption_columns.sql
```

Then, from a terminal with the standalone database URL and message-encryption variables loaded, run:

```text
npm run migrate:p1-v5a:encrypt-messages
```

Expected end line:

```text
P1-V5A encryption backfill PASS
```

Then run:

```text
database/migrations/202609012310__p1_v5a_message_encryption_finalize.sql
```

Finally run:

```text
database/verification/verify_p1_v5a_message_encryption.sql
```

All P1-V5A gates must return PASS.

## Direct database evidence

After finalization, this must fail because the plaintext column no longer exists:

```sql
SELECT body_text FROM ac_message LIMIT 1;
```

Direct database inspection should instead show binary ciphertext/nonce/tag and a non-secret key id. Do not interpret ciphertext output as proof of E2EE; this checkpoint is application-level encryption at rest.

## Practical browser regression

Restart the API with the same encryption key used for backfill. Alice and Bob must still load the old P1-V5 conversation history. Send one new DM and one new channel message, refresh the other browser, and verify both decrypt/render normally.

Then query database metadata/ciphertext only and verify there is no plaintext message column.
