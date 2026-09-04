\
# P1-V7 Acceptance — Web UX Hardening + Durable Basic Attachments

## Checkpoint

- Phase: 1
- Checkpoint: P1-V7
- Version: `0.13.0-phase1`
- Stable base before P1-V7: `95c79e4a2ed8cca287a69c8b1fb5d9dd729f3e60`

## Automated gates

The accepted P1-V7 working state passed:

- JavaScript syntax checks
- 141/141 tests before checkpoint-version finalization
- Vite production build
- trailing-whitespace check
- `git diff --check`
- exact working-tree boundary gate
- attachment encryption/tamper tests
- storage-path safety tests
- attachment schema/authorization/provider-neutrality tests

Final checkpoint verification must be rerun after version/checkpoint finalization.

## Practical web UX gates

Passed:

- P1-V6 DM/channel realtime regression
- connection-state presentation and reconnect recovery
- grouped consecutive sender messages
- date separators
- smart scroll while reading older history
- bottom-following realtime behavior
- deterministic unread-at-open New Messages divider
- active-conversation realtime arrival divider
- unread count remains zero when the selected conversation is visibly readable
- unread increments while reading older history and clears at bottom
- toast navigation to target conversation
- growing composer / Enter / Shift+Enter behavior
- responsive mobile drawer and Escape dismissal

## Practical attachment gates

Passed:

- attachment selection/pending UI
- realtime attachment delivery
- attachment download with original filename
- reverse-direction attachment send/download
- attachment survives browser refresh and history reload
- channel attachment unread/new-message behavior
- opaque UUID `.bin` local-storage object names
- PostgreSQL attachment metadata persisted
- nonce length 12 bytes
- authentication-tag length 16 bytes
- encryption version 1
- application encryption key id persisted
- no plaintext `file_name`, `original_file_name`, `content_bytes`, or `plaintext_content` columns in `ac_attachment`
- unsupported-file browser rejection

## Security interpretation

P1-V7 attachment encryption is application-level AES-256-GCM at rest, not E2EE. The API decrypts authorized downloads in application memory. Local object storage sees only encrypted bytes. PostgreSQL stores metadata, SHA-256 digest, opaque storage key, nonce/authentication tag and encryption key/version metadata.

The original filename is protected inside the encrypted parent-message body and is not stored in a plaintext attachment filename column.

P1-V7 does not claim production malware scanning, content-disarm, large-file streaming, or production S3/KMS hardening. Those remain later production-hardening gates.

## Exit result

P1-V7 is acceptable for commit when the final version/checkpoint package is applied, `package-lock.json` is synchronized, the full repository verification passes, the staged boundary is exact, and no secrets or local attachment objects are tracked.
