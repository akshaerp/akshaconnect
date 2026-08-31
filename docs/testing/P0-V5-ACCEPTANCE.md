# P0-V5 Acceptance

P0-V5 passes when:

1. P0-V1 through P0-V4 tests continue to pass.
2. Provider configuration recognizes only `LOCAL`/`AKSHAERP` identity and `NONE`/`AKSHAERP` business providers.
3. `LOCAL/NONE` composition requires no ERP URL, shared secret or network request.
4. `LOCAL` identity is supplied by an AkshaConnect-owned identity port and missing local identity fails closed.
5. Authentication and user search work through the local provider without invoking the ERP adapter.
6. ERP lookup/action in `NONE` mode fails explicitly with `ERP_FEATURE_UNAVAILABLE`.
7. `AKSHAERP` mode still composes the P0-V4 native connector.
8. Legacy P0-V4 environment behavior remains covered during migration.
9. Provider code contains no direct ERP module/table imports.
10. `npm run verify` reports zero failures.
