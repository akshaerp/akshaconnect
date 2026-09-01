# AkshaConnect

AkshaConnect is an independent enterprise collaboration product with web/mobile clients and pluggable identity/business providers. AkshaERP is its deepest native integration, but AkshaConnect core can run without AkshaERP.

The repository is currently in **Phase 0: audit, contracts and extraction preparation**.

## Current checkpoint — P0-V6D

Version: `0.7.0-phase0`

P0-V6D corrects the business-integration boundary so the AkshaConnect core is genuinely provider-neutral:

- core depends on `businessGateway`, not `erpGateway`
- core operations are `searchBusinessRecords()` and `executeBusinessAction()`
- the generic request carries `resource_type`, `resource_id` and `action`
- AkshaERP module codes, function codes and security-table concepts do not cross the core boundary
- the AkshaERP adapter translates the generic contract to its provider-specific IGW transport
- `LOCAL/NONE` remains the pure standalone mode and requires no ERP URL, credentials or network access

P0-V6B remains the transport baseline for the AkshaERP provider:

- service authentication uses `x-api-client-id` + `x-api-key`
- the adapter unwraps the standard IGW `{ success, message, data, requestId }` envelope
- the user Bearer token is sent only to the identity verification endpoint
- HMAC/shared-secret signing is not used by the active AkshaERP runtime connector
- timeout/network/non-2xx failures remain normalized and fail closed

P0-V6A lives in the AkshaERP repository and provides the secured receiver under `/api/v1/akshaconnect/*`. The matching P0-V6D ERP-side adapter consumes the generic AkshaConnect request and maps it to AkshaERP-native authorization and data services.

## Provider modes

Pure standalone:

```text
AKSHACONNECT_IDENTITY_PROVIDER=LOCAL
AKSHACONNECT_BUSINESS_PROVIDER=NONE
```

AkshaERP integrated:

```text
AKSHACONNECT_IDENTITY_PROVIDER=AKSHAERP
AKSHACONNECT_BUSINESS_PROVIDER=AKSHAERP
```

Mixed identity-only integration:

```text
AKSHACONNECT_IDENTITY_PROVIDER=AKSHAERP
AKSHACONNECT_BUSINESS_PROVIDER=NONE
```

## Core boundary

```text
AkshaConnect core
  -> identityGateway
  -> businessGateway
       -> searchRecords()
       -> executeAction()
  -> notificationPort
```

The core does not know AkshaERP module/function codes, tables, role models or security implementation details. A provider adapter owns those translations.

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
  "checkpoint": "P0-V6D",
  "version": "0.7.0-phase0"
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

AkshaConnect owns collaboration data and UX. In `LOCAL/NONE` mode it also owns collaboration identity/session state. When a business provider is enabled, that provider remains authoritative for its own records, actions and authorization decisions.

Read these before extracting production code:

- `docs/architecture/P0-V2-SOURCE-BASELINE.md`
- `docs/architecture/P0-V2-IMPLEMENTATION-INVENTORY.md`
- `docs/architecture/P0-V2-EXTRACTION-MAP.md`
- `docs/architecture/P0-V5-PROVIDER-ARCHITECTURE.md`
- `docs/architecture/P0-V6B-IGW-CLIENT-TRANSPORT.md`
- `docs/architecture/P0-V6D-GENERIC-BUSINESS-BOUNDARY.md`
