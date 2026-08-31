# V4 Manifest — P0-V4 ERP Integration Transport

Version: `0.4.0-phase0`

Base checkpoint:

`072ff81b41f23fc62dc852ab1d0989d48557b5ff`

P0-V4 adds:

- versioned ERP integration transport contract `1.0`
- HMAC-SHA256 signed service requests
- HTTP JSON transport with timeout/fail-closed errors
- concrete HTTP implementations of `identityGateway` and `erpGateway`
- environment-based feature flag disabled by default
- transport boundary tests

No AkshaERP database/model imports are introduced and production integration remains disabled until matching AkshaERP endpoints exist.
