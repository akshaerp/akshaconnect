# AkshaConnect

AkshaConnect is the standalone collaboration product for AkshaERP. It provides the target web/mobile collaboration boundary while keeping AkshaERP authoritative for ERP identity, permissions, workflow/approvals, reporting, Job Management (JBM), ERP record lookup and CHUB routing.

The repository is currently in **Phase 0: audit, contracts and extraction preparation**.

## Current checkpoint — P0-V4

Version: `0.4.0-phase0`


P0-V4 adds the fail-closed, versioned AkshaERP HTTP transport underneath the P0-V3 ports. Integration remains disabled by default until matching AkshaERP endpoints are implemented and validated.

P0-V4 adds:

- contract `1.0` service paths for identity verification, user search, ERP lookup and ERP actions
- HMAC-SHA256 service request signing with timestamp, nonce and body digest
- timeout/network/non-2xx normalization
- environment feature flag disabled by default
- no direct ERP models/tables or CHUB/push imports

P0-V3 remains the executable boundary layer:

- verified request context sourced only from the identity gateway
- fail-closed `identityGateway`, `erpGateway` and `notificationPort` contracts
- trusted tenant/org/branch/user rebinding for user search, ERP lookup and ERP actions
- AkshaConnect-owned notification port instead of ERP push-service imports
- automated guards against direct Access Management, CHUB and ERP push coupling

P0-V2 pins the source AkshaERP implementation to commit `21f72ba86bb1cb2e09012285a7b01d71a45280e0` and converts the broad V1 audit into a machine-readable, file-level extraction map.

Added in V2:

- exact source baseline and source SHA
- file-level `MOVE` / `ADAPT` / `KEEP_IN_ERP` / `SHARED_CONTRACT` / `TRANSITIONAL` / `DEPRECATE_LATER` decisions
- dependency-risk analysis for identity, realtime, CHUB, push, ERP lookup and database migration
- ordered extraction sequence
- automated tests that protect critical ownership boundaries

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
  "version": "0.2.0-phase0"
}
```

## Architecture boundary

AkshaConnect owns collaboration data and UX. AkshaERP remains the system of record for identity/organization authority and business actions. Do not copy ERP approval, record-lookup or CHUB logic into this repository.

Read these before extracting production code:

- `docs/architecture/P0-V2-SOURCE-BASELINE.md`
- `docs/architecture/P0-V2-IMPLEMENTATION-INVENTORY.md`
- `docs/architecture/P0-V2-EXTRACTION-MAP.md`
- `docs/architecture/P0-V2-DEPENDENCY-RISKS.md`
- `docs/architecture/P0-V2-EXTRACTION-MAP.json`
