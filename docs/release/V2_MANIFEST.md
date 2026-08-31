# AkshaConnect V2 — P0-V2 Extraction Map Manifest

Version: `0.2.0-phase0`  
Base standalone commit: `7fe19047fbc61f2ba7daefbfd9c963c49e630293`  
Audited AkshaERP commit: `21f72ba86bb1cb2e09012285a7b01d71a45280e0`

## Purpose

Convert the V1 broad audit into a pinned, machine-readable, file-level extraction decision before any production collaboration code is copied.

## Added

- Pinned AkshaERP source baseline
- File-level implementation inventory
- Machine-readable extraction map with six dispositions
- Dependency/risk analysis
- Ordered extraction sequence
- Automated classification/invariant tests
- Version bump to `0.2.0-phase0`

## Explicitly not done in V2

- No production AkshaERP code copied yet
- No direct ERP database connection added
- No shared `JWT_SECRET` assumption added to standalone runtime
- No CHUB/approval/business logic duplicated
- No mobile/web shell migration yet

## Exit gate

P0-V2 passes when the extraction-map tests pass and the team accepts the ownership classification, especially identity, CHUB, ERP lookup, realtime and SystemSender boundaries.
