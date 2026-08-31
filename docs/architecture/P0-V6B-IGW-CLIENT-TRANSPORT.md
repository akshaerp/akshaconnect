# P0-V6B Integration Gateway Client Transport

**Standalone base:** `f77859911a6edc3356a45b7e2e62592c2b9a203f`
**Matching ERP receiver branch checkpoint:** `155d5d083dbc746319ec74cd53b302b67626fc91`

P0-V6B aligns the standalone AkshaERP provider with the security boundary that already exists in AkshaERP Integration Gateway.

## Runtime authentication

The active connector now sends:

```text
x-api-client-id: <IGW client code>
x-api-key: <IGW API key>
```

The API key is a deployment secret and must not be committed.

The ERP user's Bearer token is sent only to:

```text
POST /api/v1/akshaconnect/identity/verify
```

User search, ERP record lookup and ERP action execution use the verified context produced by the standalone integration boundary and the service credentials; they do not forward the user's Bearer token.

## Why HMAC is no longer the active connector

P0-V4 introduced an HMAC/shared-secret request-signing proof before the existing AkshaERP Integration Gateway was fully audited. P0-V6A confirmed that AkshaERP already provides API-client authentication, scope authorization, origin/IP controls, request logging and idempotency infrastructure.

Creating a parallel service-authentication scheme would duplicate security authority. P0-V6B therefore removes HMAC/shared-secret use from the active transport. The historical signer module remains in the Phase 0 repository only so previous design work is traceable; runtime connector files do not import it.

## Response contract

AkshaERP IGW returns:

```json
{
  "success": true,
  "message": "Request processed successfully.",
  "data": {},
  "requestId": "..."
}
```

P0-V6B requires a valid object envelope with `success === true` and a `data` property. It returns only `data` to the existing identity/business ports.

Malformed 2xx envelopes fail closed with `ERP_INTEGRATION_RESPONSE_INVALID`.

Non-2xx responses remain generic at the standalone boundary. The connector records only safe metadata such as HTTP status, `errorCode` and `requestId`; remote error prose is not trusted or exposed.

## Configuration

```text
AKSHACONNECT_ERP_BASE_URL=https://erp.example.invalid
AKSHACONNECT_ERP_API_CLIENT_ID=
AKSHACONNECT_ERP_API_KEY=
AKSHACONNECT_ERP_TIMEOUT_MS=5000
```

No ERP configuration is required or read in `LOCAL/NONE` mode.

## Deployment dependency

Before integrated local/server testing, the matching AkshaERP environment must:

1. deploy P0-V6A receiver code;
2. run `database/modules/igw/post_migrations/202608312100__igw_akshaconnect_scopes.sql`;
3. create/configure a tenant-bound AkshaConnect IGW API client;
4. grant only the required `akshaconnect.*` scopes;
5. place the generated API key in the AkshaConnect deployment secret store.

The SQL is deliberately not executed during source-package validation.
