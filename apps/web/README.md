# AkshaConnect Web

P1-V7 V1C hardens the P1-V6 realtime web experience without changing the provider-neutral messaging contract.

## Local development

Run the API on port `4100`, then:

```text
npm run start:web
```

Open `http://127.0.0.1:4173`.

The Vite development server proxies `/api`, `/health`, `/ready`, and WebSocket `/ws` traffic to the standalone API. The browser sends the AkshaConnect bearer session only in the first WebSocket authentication frame; it is never placed in the WebSocket URL.

## P1-V7 V1C UX hardening

This iteration keeps the durable/realtime P1-V6 behavior and adds:

- responsive mobile/tablet sidebar drawer instead of horizontal desktop overflow
- visible Connected / Connecting / Reconnecting / Offline state
- total unread counts in channel and DM section headings
- browser-title unread count
- date separators and consecutive-message grouping
- deterministic first-unread divider based on the unread-at-open snapshot
- realtime arrival divider even when the selected conversation is already visible at the bottom; readable messages stay read while still receiving a clear visual arrival marker
- follow-latest auto-scroll only when the user is already near the bottom
- visible-at-bottom read acknowledgement without requiring browser focus; hidden/older-history views retain unread state
- a New messages jump control when the user is reading older history
- notification toast navigation into the target conversation
- Escape-key dismissal for temporary panels and mobile navigation
- composer auto-growth and near-limit character feedback

P1-V7 V2 will add the roadmap's basic attachment-selection UI. Attachment bytes are not silently stored in PostgreSQL or embedded into normal message bodies.

## P1-V7 V2 attachments

The composer can select up to four supported files per send, with a 10 MB limit per file.
Each selected file is uploaded as an idempotent `ATTACHMENT` message and appears in
history/realtime as a downloadable attachment card.

Local development requires the API process to set
`AKSHACONNECT_ATTACHMENT_LOCAL_DIR` to a directory outside the Git repository.
The file bytes are AES-256-GCM encrypted before they are written to local storage;
PostgreSQL stores attachment metadata, content hash, storage reference and encryption
metadata. The original file name is not stored as a plaintext attachment column: it
uses the already-encrypted message body.

V2 deliberately allows only a small file-type allowlist and does not claim malware
scanning. Production malware scanning/object-storage hardening remains a later gate.
