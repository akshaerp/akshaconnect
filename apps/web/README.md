# AkshaConnect Web

P1-V5 activates the P1-V4 conversation shell as a durable HTTP messaging client.

Run the API on port `4100`, then:

```text
npm run start:web
```

Open `http://127.0.0.1:4173`.

The web client supports LOCAL login/session restore, channel and DM discovery/creation, durable history, message send, older-message pagination, read-cursor advancement, manual refresh, and logout.

P1-V5 deliberately uses HTTP only. Cross-browser realtime delivery is P1-V6.
