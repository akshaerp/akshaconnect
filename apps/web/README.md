# AkshaConnect Web

P1-V6 upgrades the durable P1-V5 client with authenticated realtime delivery, unread counts, reconnect reconciliation, and incoming-message notifications.

## Local development

Run the API on port `4100`, then:

```text
npm run start:web
```

Open `http://127.0.0.1:4173`.

The Vite development server proxies `/api`, `/health`, `/ready`, and WebSocket `/ws` traffic to the standalone API. The browser sends the AkshaConnect bearer session only in the first WebSocket authentication frame; it is never placed in the WebSocket URL.

Realtime events accelerate the UI but do not replace durable history. On reconnect the client reloads navigation/unread state and refreshes the selected conversation from PostgreSQL-backed APIs.
