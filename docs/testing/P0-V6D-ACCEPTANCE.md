# P0-V6D Acceptance

P0-V6D is accepted only when all of the following pass:

- JavaScript syntax validation passes.
- Full Node test suite passes.
- `LOCAL/NONE` mode performs zero AkshaERP network calls.
- core port contract exposes `businessGateway.searchRecords` and `businessGateway.executeAction`.
- core boundary exposes `searchBusinessRecords` and `executeBusinessAction`.
- core boundary contains no `erpGateway`, `module_code`, `function_code`, `entity_type`, AkshaERP table name or AkshaERP security-table coupling.
- trusted tenant/organization/branch/actor context cannot be overridden by caller input.
- generic record lookup uses `resource_type`.
- generic action execution uses `resource_type`, `resource_id` and `action`.
- AkshaERP adapter remains the only place that knows the AkshaERP IGW record/action paths.
- no production credential is added to the repository.

Expected version: `0.7.0-phase0`.
