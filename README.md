# AkshaConnect

AkshaConnect is the standalone collaboration product for AkshaERP. It will provide web and mobile messaging while keeping AkshaERP authoritative for ERP identity, permissions, workflow, approvals, reporting, Job Management (JBM), and CHUB routing.

This repository starts with **Phase 0: current-state audit and extraction foundation**.

## Phase 0 V1 contents

- Runnable Node.js API health/readiness service
- Zero-dependency JavaScript validation/test baseline
- GitHub Actions CI baseline
- Docker baseline
- Versioned ERP event contract (`1.0`)
- Current AkshaERP AkshaConnect inventory
- SystemSender preservation rules
- Authentication/tenant-context boundary
- Extraction ownership matrix and sequencing

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
  "version": "0.1.0-phase0"
}
```

## Architecture boundary

AkshaConnect owns collaboration data and user experience. AkshaERP remains the system of record for business identity, authorization, workflow, approvals, reports, scheduled jobs, and external communication routing.

Do not copy ERP approval/business rules into this repository. An action shown by AkshaConnect is only a request; AkshaERP must authorize and execute it.

See `docs/architecture/PHASE-0-CURRENT-STATE-AUDIT.md` and `docs/architecture/PHASE-0-EXTRACTION-BOUNDARIES.md` before moving production code.
