# P0-V4 Versioned AkshaERP Integration Transport

**Checkpoint:** P0-V4  
**Standalone base:** `072ff81b41f23fc62dc852ab1d0989d48557b5ff`

P0-V4 implements the transport underneath the P0-V3 ports without copying ERP implementation code.

## Default state

AkshaERP integration is **disabled by default**. `AKSHACONNECT_ERP_INTEGRATION_ENABLED` must be explicitly enabled. When disabled, identity and ERP gateway calls fail closed with `ERP_INTEGRATION_DISABLED`; the application does not silently fall back to direct ERP database access.

## Versioned endpoints

Contract `1.0` defines four service endpoints:

- `/api/v1/akshaconnect/identity/verify`
- `/api/v1/akshaconnect/identity/users/search`
- `/api/v1/akshaconnect/erp/records/search`
- `/api/v1/akshaconnect/erp/actions/execute`

These are the standalone-side contract paths. AkshaERP must implement and authorize them before production integration is enabled.

## Request signing

Every service request is signed with HMAC-SHA256 over:

1. HTTP method
2. request path
3. ISO timestamp
4. nonce
5. SHA-256 of the exact request body

Transport headers carry service id, contract version, timestamp, nonce, body digest and signature. AkshaERP must reject stale timestamps, replayed nonces, invalid body digests and invalid signatures.

The shared secret is deployment configuration only. It is never committed to source control.

## Identity token handling

`verifyAccessToken` forwards the user's access token only in the Authorization header over the signed TLS service request. AkshaConnect does not decode the ERP token into trusted identity by itself. Only claims returned by the ERP identity endpoint are allowed to create a `verifiedRequestContext`.

## Error behavior

- integration disabled -> fail closed
- invalid local configuration -> fail at composition time
- network failure -> generic `ERP_INTEGRATION_UNAVAILABLE`
- timeout -> `ERP_INTEGRATION_TIMEOUT`
- invalid JSON -> `ERP_INTEGRATION_RESPONSE_INVALID`
- non-2xx remote result -> `ERP_INTEGRATION_HTTP_ERROR`

Remote response text and network exception details are not exposed as trusted application errors.

## Not yet production-ready

P0-V4 does not enable the adapter in the runtime server and does not add AkshaERP-side endpoints. Those will be integrated only after the AkshaERP contract implementation is created and tested. Collaboration persistence also remains unmoved at this checkpoint.
