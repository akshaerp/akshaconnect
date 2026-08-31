# P0-V4 Acceptance

P0-V4 passes when:

1. P0-V1 through P0-V3 tests continue to pass.
2. ERP integration is disabled by default and fails closed.
3. Enabling integration with incomplete configuration fails immediately.
4. Service requests use contract version `1.0` paths.
5. Requests carry a deterministic HMAC-SHA256 signature envelope.
6. User access tokens are passed only to the identity verification endpoint.
7. Network/non-2xx failures are normalized without leaking untrusted remote text.
8. The new transport imports no ERP module implementation and references no ERP identity tables.
9. No real shared secret appears in source or `.env.example`.
10. `npm run verify` reports zero failures.
