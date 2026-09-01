# AkshaConnect Web

P1-V4 turns the reserved `apps/web` directory into the first standalone React client.

## Local development

Start the API in one terminal on port `4100`, then start the web client in another terminal:

```text
npm run start:api
npm run start:web
```

Open:

```text
http://127.0.0.1:4173
```

The Vite development server proxies `/api`, `/health`, and `/ready` to the standalone AkshaConnect API, so no development CORS exception is required.

## P1-V4 scope

The client supports LOCAL login/session restore, channel listing/creation, direct-message listing/creation, workspace member lookup, conversation selection, and logout.

The conversation view and composer are intentionally non-sending shells. Durable message send/history is P1-V5.
