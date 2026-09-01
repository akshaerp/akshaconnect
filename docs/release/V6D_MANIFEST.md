# P0-V6D Release Manifest

Base commit: `68047d8235b03116ff6065538ea483af4da876d9`

Version: `0.7.0-phase0`

Purpose: replace the ERP-shaped AkshaConnect core business boundary with a generic provider-neutral boundary while keeping AkshaERP behind a provider adapter.

Important behavior:

- `erpGateway` -> `businessGateway`
- `lookupErpRecords` -> `searchBusinessRecords`
- `executeErpAction` -> `executeBusinessAction`
- generic `resource_type/resource_id/action` contract
- `LOCAL/NONE` remains ERP-independent
- provider-specific AkshaERP transport remains IGW API client + API key

Apply only to the expected P0-V6B base and run `npm run verify` before commit.
