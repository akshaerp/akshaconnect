# P0-V6B Acceptance

P0-V6B passes when:

1. P0-V1 through P0-V5 collaboration/provider boundaries remain green.
2. The active AkshaERP runtime connector uses `x-api-client-id` and `x-api-key`.
3. Runtime transport code does not import the P0-V4 HMAC signer or read `AKSHACONNECT_ERP_SHARED_SECRET`.
4. The user Bearer token is forwarded only to the ERP identity-verification endpoint.
5. Successful ERP calls require and unwrap the standard IGW `{ success, message, data, requestId }` envelope.
6. Malformed 2xx envelopes fail closed.
7. Non-2xx responses do not expose remote message text and safely retain HTTP status / error code / request id metadata.
8. Missing base URL, API client id or API key fails composition for an `AKSHAERP` provider.
9. `LOCAL/NONE` composition still requires no ERP URL, credential or network call.
10. Direct ERP implementation/table coupling remains forbidden.
11. Health/readiness reports `P0-V6B` and `0.6.0-phase0`.
12. `npm run verify` reports zero failures.

## Deployment gate

Do not attempt ERP end-to-end calls until the P0-V6A receiver is deployed, its scope SQL is run in the target environment, and an AkshaConnect IGW API client/key with the required scopes is configured.
