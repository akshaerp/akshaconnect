# P1-V7 — Web UX Hardening

**Base checkpoint:** `95c79e4a2ed8cca287a69c8b1fb5d9dd729f3e60` (P1-V6)
**Iteration:** V1A — responsive/realtime/unread conversation UX hardening
**Database migration:** none

## Goal

Turn the technically complete P1-V6 realtime web client into a practical daily conversation surface while preserving the existing durable encrypted-message and provider-neutral security boundaries.

## V1 scope

### Responsive navigation

Desktop keeps the two-column layout. At tablet/mobile widths, the workspace sidebar becomes an off-canvas drawer with an explicit menu button, overlay dismissal and Escape-key dismissal. This removes the previous horizontal-scroll layout.

### Realtime state

The selected conversation shows a textual connection state: Connected, Connecting, Reconnecting or Offline. A reconnect/offline banner explains that realtime is interrupted and that durable history will reconcile when connectivity returns. This is presentation only; P1-V6 remains the authoritative WebSocket reconnect implementation.

### Unread experience

Existing trusted `/api/v1/unread-counts` data remains authoritative. V1 adds channel-section and DM-section totals plus a total unread browser-title badge. Opening a conversation captures the unread count before any read acknowledgement and passes that immutable snapshot into the initial history load. The snapshot deterministically places a local "New messages" divider at the first unread row; the sidebar count clears only after the durable read-cursor request succeeds.

### Message readability

Messages are grouped only when sender identity/type is identical, the messages are on the same local calendar day and timestamps are no more than five minutes apart. Date separators are derived from message timestamps and display Today, Yesterday or a localized date label.

### Scroll discipline

The client follows a new realtime message only when the user is already near the bottom of history. If the user is reading older content, the scroll position is preserved and a "New messages" jump control appears. The selected conversation is considered readable when it is visible and at the bottom; browser focus alone is not required. Hidden tabs or users reading older history retain unread state until they return to the read boundary. Sending one's own message always returns to the latest message. Incoming non-self realtime messages also establish a local "New messages" arrival divider even when the selected conversation is already visible at the bottom. In that case the durable read cursor may advance immediately and no unread badge is fabricated; the divider is only an attention marker. If the same conversation is open in a hidden browser tab, normal unread accounting remains active until that tab becomes visible/readable. Sending a reply clears the local arrival marker.

### Toast navigation

Incoming toasts carry only already-available client navigation metadata. Clicking a toast opens the existing authorized channel/DM entry and clears its local unread presentation. The server remains authoritative for conversation access.

## Security / architecture invariants

- No provider-specific ERP module/function/table contracts are introduced.
- No bearer/session token is placed into a WebSocket URL.
- No new persistence bypasses P1-V5A message encryption.
- Realtime remains an acceleration layer; PostgreSQL-backed history is still the recovery source after reconnect.
- Unread authority remains server/read-cursor based; UI counters are reconciliation state, not authorization state.
- V1 introduces no fake Delivered/Read ticks. Delivery/read receipt semantics require an explicit contract and are outside this V1 change.

## V2 boundary

The roadmap requires basic attachment UI in P1-V7. V2 will add file selection, visible queued-file metadata, remove/cancel behavior, size/type validation and a fail-closed server boundary. It must not invent attachment persistence in message text or database byte columns merely to make the UI appear functional.

## V2 — durable basic attachment UI

V2 implements the roadmap's basic attachment UI against a real durable backend boundary.

- Up to four files can be selected in the web composer.
- Maximum file size is 10 MB per file.
- Initial allowlist: JPEG, PNG, WebP, PDF, TXT, CSV, DOCX, XLSX and PPTX.
- Each attachment is an idempotent human `ATTACHMENT` message.
- Attachment bytes are AES-256-GCM encrypted in application memory before the local
  storage provider writes them.
- PostgreSQL stores the SHA-256 digest, size, MIME type, opaque storage key and
  encryption metadata, but not plaintext file bytes.
- The original file name is carried in the encrypted parent-message body rather than
  a plaintext attachment filename column.
- Download always re-authorizes the workspace/conversation, decrypts in application
  memory and verifies SHA-256 + size before returning bytes.
- Storage keys are generated UUID object names; client filenames never become paths.
- Realtime uses the existing `message.created` event and therefore preserves the
  P1-V6 durable-first/reconnect model.
- Missing `AKSHACONNECT_ATTACHMENT_LOCAL_DIR` fails attachment upload/download with
  a controlled 503 but does not prevent normal messaging from starting.

This is not a malware-scanning or large-object implementation. Production object
storage, antivirus/content-disarm policy and larger streaming uploads remain later
hardening gates. V2 also does not introduce cosmetic Delivered/Read ticks.
