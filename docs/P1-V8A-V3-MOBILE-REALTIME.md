# P1-V8A V3 — Mobile Realtime Messaging

## Goal

Remove the manual Refresh requirement for incoming mobile messages while
preserving durable messaging as the authoritative source of truth, and keep
workspace unread state coherent when realtime messages arrive outside the
currently open conversation.

## Existing server contracts reused

V3 uses the existing provider-neutral AkshaConnect realtime endpoint:

```text
GET/UPGRADE /ws
```

Authentication remains first-frame only:

```json
{
  "type": "auth",
  "access_token": "<opaque bearer>"
}
```

The bearer is not placed in the WebSocket URL.

After successful authentication the server sends:

```json
{
  "type": "ready"
}
```

Durable message creation is delivered as:

```json
{
  "type": "message.created",
  "conversation_id": "<conversation id>",
  "message": {
    "message_id": "<durable message id>"
  }
}
```

V3 also reuses the existing durable unread/read-cursor APIs:

```text
GET /api/v1/unread-counts
PUT /api/v1/conversations/:conversationId/read-cursor
```

and the existing realtime read reconciliation event:

```text
read_cursor.updated
```

## Mobile V3 behavior

- Connect after a valid authenticated mobile session exists.
- Derive `ws://` or `wss://` from the configured AkshaConnect server origin.
- Authenticate in the first socket frame.
- Show Live / Connecting / Reconnecting / Offline state.
- Merge `message.created` into the currently open matching conversation.
- Deduplicate the sender's HTTP response and WebSocket echo by `message_id`.
- Reconnect with bounded exponential backoff.
- Stop the socket while the mobile app is backgrounded.
- Reconnect when the app returns active.
- Reload and merge the latest durable history page after any post-initial
  successful socket connection.
- Load authoritative unread counts at login, workspace refresh and reconnect.
- Increment unread state for incoming non-self messages when another
  conversation is open or the workspace home screen is visible.
- Never create unread state or a notification from the member's own realtime
  echo.
- Show per-conversation unread badges and section unread totals.
- Show an Android system notification for incoming messages outside the
  actively open conversation while the app is active. The notification uses a
  high-importance Messages channel with the device default notification sound
  and vibration, and remains visible in the Android notification shade.
- Use the existing in-app notification banner only as a fallback when native
  notification permission is unavailable or native display fails.
- Tapping the native notification or fallback banner opens the referenced
  conversation.
- Advance the durable read cursor when the latest message of an open
  conversation is loaded or received in realtime.
- Clear local unread state after read-cursor success and reconcile
  `read_cursor.updated` events.
- Keep manual Refresh available as an explicit recovery/testing control.

## Source of truth

WebSocket delivery is best-effort acceleration. Durable encrypted message
persistence and durable read cursors remain authoritative. Reconnect
reconciliation reloads both durable history and durable unread counts so a
socket gap cannot become permanent message or unread-state loss in the UI.

## Explicitly deferred

V3 does not add delivery/read receipt presentation, attachments, secure
persisted login, push notification registration, Android notification delivery
for messages that arrive while the app is backgrounded/killed, iOS APNs remote
delivery, or offline send queues.

Foreground Android system notifications are included in V3. True
background/killed message delivery still requires the later FCM/APNs push
checkpoint because mobile operating systems may suspend the WebSocket process
while the app is not active.
