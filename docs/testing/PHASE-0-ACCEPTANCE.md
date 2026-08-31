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

Expected HTTP 200 with `status = ok`, `phase = 0`, and the current checkpoint/version.

## Phase 0 V1 pass gate

V1 is accepted when:

1. CI/test baseline runs from a clean clone.
2. Health endpoint works locally.
3. Docker image builds.
4. Current-state audit is reviewed against AkshaERP.
5. SystemSender/realtime invariants are accepted as migration regression requirements.
6. No ERP business logic has been duplicated into the standalone repository.

## P0-V3 cumulative gate

The standalone API contains executable identity/ERP/notification ports. Verified scope must come from the identity gateway and new boundary code must not import ERP Access Management, CHUB, or ERP push implementations directly. See `P0-V3-ACCEPTANCE.md`.

## P0-V4 cumulative gate

P0-V4 introduced the first versioned ERP transport and HMAC signing helper. Its HMAC runtime authentication assumption is superseded by P0-V6B; the helper remains historical Phase 0 code.

## P0-V5 cumulative gate

AkshaConnect core is provider-neutral. `LOCAL` identity with `NONE` business integration is a valid standalone composition and must not instantiate or call the AkshaERP connector. See `P0-V5-ACCEPTANCE.md`.

## P0-V6B cumulative gate

The AkshaERP provider must authenticate through the existing AkshaERP Integration Gateway with `x-api-client-id` and `x-api-key`, unwrap the standard IGW response envelope, keep the ERP user Bearer token limited to identity verification, and never require ERP configuration in `LOCAL/NONE` mode. See `P0-V6B-ACCEPTANCE.md`.
