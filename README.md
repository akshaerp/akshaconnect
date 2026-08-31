# AkshaConnect

AkshaConnect is an independent enterprise collaboration product with web/mobile clients and pluggable identity/business providers. AkshaERP is its deepest native integration, but AkshaConnect core can run without AkshaERP.

The repository is currently in **Phase 0: audit, contracts and extraction preparation**.

## Current checkpoint — P0-V6B

Version: `0.6.0-phase0`

P0-V6B aligns the AkshaERP native provider with the real AkshaERP Integration Gateway security and response model:

- AkshaERP service authentication uses `x-api-client-id` + `x-api-key`
- the standalone connector unwraps the standard IGW `{ success, message, data, requestId }` envelope
- the user Bearer token is still sent only to the identity verification endpoint
- HMAC/shared-secret signing is no longer used by the active AkshaERP runtime connector
- timeout/network/non-2xx failures remain normalized and fail closed
- `LOCAL/NONE` standalone mode still requires no ERP URL, credentials or network access

P0-V6A lives in the AkshaERP repository and provides the matching secured receiver under `/api/v1/akshaconnect/*`.

P0-V5 makes standalone independence explicit:

- `LOCAL` identity + `NONE` business provider is the pure AkshaConnect mode
- AkshaERP is a native provider/connector, not a mandatory runtime dependency
- standalone composition must not require ERP URL, credentials or network access
- ERP-only capabilities fail explicitly when no business provider is configured

P0-V4 introduced the first versioned HTTP transport and an HMAC signing helper. P0-V6B supersedes HMAC as the active AkshaERP authentication model because AkshaERP already owns a mature Integration Gateway credential/scope/IP boundary. The signing helper remains historical Phase 0 code only and is not called by the V6B runtime transport.

P0-V3 remains the executable boundary layer:

- verified request context sourced only from the identity gateway
- fail-closed `identityGateway`, `erpGateway` and `notificationPort` contracts
- trusted tenant/org/branch/user rebinding for user search, ERP lookup and ERP actions
- AkshaConnect-owned notification port instead of ERP push-service imports
- automated guards against direct Access Management, CHUB and ERP push coupling

P0-V2 pins the source AkshaERP implementation to commit `21f72ba86bb1cb2e09012285a7b01d71a45280e0` and converts the broad V1 audit into a machine-readable, file-level extraction map.

V1 foundation remains intact:

- runnable health/readiness API
- CI and Docker baseline
- ERP event contract `1.0`
- auth/tenant-context contract
- SystemSender migration invariants

## Requirements

- Node.js 20 or newer
- npm 10 or newer recommended
- Docker optional

## Verify locally

```bash
npm ci
npm run verify
npm run start:api
```

Health endpoints:

```text
GET http://localhost:4100/health
GET http://localhost:4100/ready
```

Expected health payload includes:

```json
{
  "status": "ok",
  "service": "akshaconnect-api",
  "phase": "0",
  "checkpoint": "P0-V6B",
  "version": "0.6.0-phase0"
}
```

## AkshaERP provider configuration

When either provider is `AKSHAERP`, configure:

```text
AKSHACONNECT_ERP_BASE_URL=https://your-erp-host
AKSHACONNECT_ERP_API_CLIENT_ID=<IGW client code>
AKSHACONNECT_ERP_API_KEY=<IGW API key from secret store>
```

Do not place a production API key in source control. The matching AkshaERP Integration Gateway client must be tenant-bound and granted only the required `akshaconnect.*` scopes.

## Architecture boundary

AkshaConnect owns collaboration data and UX. In `LOCAL/NONE` mode it also owns collaboration identity/session state. When the AkshaERP provider is enabled, AkshaERP remains authoritative for ERP identity context and business actions. Do not copy ERP approval, record-lookup or CHUB logic into this repository.

Read these before extracting production code:

- `docs/architecture/P0-V2-SOURCE-BASELINE.md`
- `docs/architecture/P0-V2-IMPLEMENTATION-INVENTORY.md`
- `docs/architecture/P0-V2-EXTRACTION-MAP.md`
- `docs/architecture/P0-V2-DEPENDENCY-RISKS.md`
- `docs/architecture/P0-V2-EXTRACTION-MAP.json`
- `docs/architecture/P0-V6B-IGW-CLIENT-TRANSPORT.md`
