# Phase 0 V1 Acceptance (Historical Gate)

## Automated verification

Run from repository root:

```bash
npm ci
npm run verify
```

Expected:

- all JavaScript files pass `node --check`
- API health test passes
- unknown API routes fail with 404
- ERP event contract tests pass
- repository structure test passes

## Runtime smoke check

```bash
npm run start:api
```

Then open:

```text
http://localhost:4100/health
```

Expected HTTP 200 with `status = ok`, `phase = 0`, and version `0.1.0-phase0` (V1 checkpoint).

## Docker check

```bash
docker compose up --build
```

Then call the same health endpoint on port 4100.

## Phase 0 V1 pass gate

V1 is accepted when:

1. CI/test baseline runs from a clean clone.
2. Health endpoint works locally.
3. Docker image builds.
4. Current-state audit is reviewed against AkshaERP.
5. SystemSender/realtime invariants are accepted as migration regression requirements.
6. No ERP business logic has been duplicated into the standalone repository.


Current acceptance gate: `P0-V2-ACCEPTANCE.md`.

## P0-V3 cumulative gate

The standalone API now also contains executable identity/ERP/notification ports. Verified scope must come from the identity gateway and new boundary code must not import ERP Access Management, CHUB, or ERP push implementations directly. See `P0-V3-ACCEPTANCE.md`.


## P0-V4 cumulative gate

The P0-V3 ports now have a versioned, signed HTTP transport implementation that is disabled by default and fails closed. No AkshaERP-side endpoint is assumed to exist yet. See `P0-V4-ACCEPTANCE.md`.
