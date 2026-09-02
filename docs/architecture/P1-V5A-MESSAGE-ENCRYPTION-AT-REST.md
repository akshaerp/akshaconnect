# P1-V5A Message Encryption at Rest

**Checkpoint:** P1-V5A
**Base Git checkpoint:** `aa72447c07b050fd264bb42bb4ebca81c20ac4ca` (P1-V4)
**Applied over:** uncommitted P1-V5 durable-messaging working tree
**Version:** `0.11.1-phase1`

## Goal

Prevent readable message content from being stored in the standalone AkshaConnect PostgreSQL database before P1-V5 is committed and before P1-V6 realtime delivery is added.

P1-V5A is application-level **encryption at rest**, not end-to-end encryption. The AkshaConnect API decrypts authorized message bodies in application memory so enterprise features such as SystemSender, workflow integration, retention policy and future search/automation remain possible.

Transport encryption remains a separate deployment requirement: production HTTP traffic must use TLS/HTTPS.

## Cryptography

Message bodies use Node.js native cryptography:

```text
AES-256-GCM
32-byte key
12-byte random nonce per encryption
16-byte authentication tag
version = 1
```

Authenticated Additional Data binds ciphertext to the AkshaConnect record context:

```text
record type + workspace id + conversation id + record id
```

Moving ciphertext to another message/revision row therefore causes authentication failure rather than silently decrypting.

## Database representation

After finalization, `ac_message` no longer has a `body_text` column. Body-bearing rows use:

```text
body_ciphertext BYTEA
body_nonce BYTEA
body_auth_tag BYTEA
body_key_id VARCHAR(120)
body_encryption_version SMALLINT
```

`ac_message_revision` uses the same representation so future edit history cannot become a plaintext bypass.

Bodyless SYSTEM/EVENT messages may keep all encrypted-body columns NULL. TEXT messages must always have a complete encrypted body.

## Key ownership

The database stores only a non-secret key identifier. It never stores the encryption key.

Runtime requires:

```text
AKSHACONNECT_MESSAGE_ENCRYPTION_KEY_ID
AKSHACONNECT_MESSAGE_ENCRYPTION_KEY_B64
```

The current key must decode to exactly 32 bytes.

For key rotation, old decryption keys can be supplied as a JSON object through:

```text
AKSHACONNECT_MESSAGE_DECRYPTION_KEYS_JSON
```

New writes always use the current key id; old key ids are decryption-only. Production should move key material behind a managed secret/KMS boundary rather than committing or storing it in application source.

## Existing-message migration

Because the encryption key must never be embedded in SQL, existing plaintext rows are migrated in three explicit steps:

1. SQL adds encrypted-body columns and transitional shape constraints.
2. `npm run migrate:p1-v5a:encrypt-messages` encrypts existing message/revision bodies in application code without printing plaintext.
3. Final SQL refuses to proceed if any plaintext body remains unencrypted, then physically drops both `body_text` columns and adds strict encrypted-body constraints.

The backfill is rerunnable before finalization and uses row locking/batches. The finalization is intentionally fail-closed.

## API compatibility

The public messaging contract still uses `body_text`. That is the authorized application representation only:

```text
browser body_text
      ↓
AkshaConnect API
      ↓ AES-256-GCM
PostgreSQL ciphertext
      ↓ authorized read
AkshaConnect API decrypts in memory
      ↓
browser body_text
```

Encryption metadata is not returned by the message HTTP API.

## Security boundary

P1-V5A protects against readable message bodies in database rows/backups and accidental direct SQL browsing of message content. It does not protect message content from a fully compromised AkshaConnect API process that holds a decryption key.

Strict E2EE is deliberately not claimed by this checkpoint.

## Exit criteria

- crypto unit tests prove roundtrip, randomized nonces, tamper detection and old-key decryption
- API startup fails closed when required encryption configuration is missing/invalid
- existing P1-V5 message bodies and revision bodies are backfilled
- `ac_message.body_text` is physically removed
- `ac_message_revision.body_text` is physically removed
- TEXT messages have complete AES-GCM storage metadata
- database contains no encryption key material
- authorized P1-V5 history still renders plaintext after application decryption
- new Alice/Bob messages are readable in the UI but not readable through direct database inspection
- full historical regression suite remains green
