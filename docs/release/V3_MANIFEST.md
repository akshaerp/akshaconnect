# V3 Manifest — P0-V3 Service Boundaries

Version: `0.3.0-phase0`

Base checkpoint:

`3c95c8b37862c1311303d7dce30ab690301e3f02`

New executable boundary code:

- `services/api/src/core/boundaryError.js`
- `services/api/src/core/verifiedRequestContext.js`
- `services/api/src/integration/portContracts.js`
- `services/api/src/integration/integrationBoundaryService.js`
- `services/api/src/integration/index.js`

New tests/docs:

- `test/p0-v3-service-boundaries.test.js`
- `docs/architecture/P0-V3-SERVICE-BOUNDARIES.md`
- `docs/testing/P0-V3-ACCEPTANCE.md`
- `docs/release/V3_MANIFEST.md`

P0-V3 is still Phase 0. It defines and tests the production extraction seams without yet wiring a production AkshaERP identity/action adapter or moving collaboration persistence.
