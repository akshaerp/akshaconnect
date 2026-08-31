# V6B Manifest — P0-V6B Integration Gateway Client Transport

Version: `0.6.0-phase0`

Standalone base:

`f77859911a6edc3356a45b7e2e62592c2b9a203f`

Matching AkshaERP receiver checkpoint:

`155d5d083dbc746319ec74cd53b302b67626fc91`

P0-V6B:

- replaces the active HMAC/shared-secret AkshaERP runtime authentication assumption with existing IGW API-client credentials;
- sends `x-api-client-id` and `x-api-key`;
- unwraps the standard Integration Gateway response envelope;
- keeps the ERP user's Bearer token limited to identity verification;
- preserves provider-neutral `LOCAL/NONE` independence;
- keeps the historical P0-V4 signer code out of the active runtime connector;
- adds cumulative regression tests and deployment documentation.

No production credential is included.
