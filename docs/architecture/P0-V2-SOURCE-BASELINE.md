# P0-V2 Source Baseline

**AkshaConnect base checkpoint:** `7fe19047fbc61f2ba7daefbfd9c963c49e630293`  
**AkshaERP source repository:** `akshaerp/aksha`  
**Pinned AkshaERP source commit:** `21f72ba86bb1cb2e09012285a7b01d71a45280e0`  
**Audit date:** 31 August 2026

## Why the source SHA is pinned

P0-V2 is an extraction decision, not a description of a moving `main` branch. Every path and dependency classification in this package is evaluated against the exact AkshaERP commit above. If AkshaERP changes after this commit, the change is a delta to review, not an invisible mutation of the baseline.

## Confirmed host integration at the pinned commit

- AkshaERP mounts authenticated AkshaConnect attachments at `/api/acn/attachments`.
- AkshaERP creates a dedicated WebSocket server for AkshaConnect and upgrades `/acn/ws`.
- Apollo loads the AkshaConnect schemas/resolvers through the ERP module loader.
- Realtime authentication currently verifies the ERP JWT with `JWT_SECRET`.
- Realtime channel subscription checks durable `acn_channel_members` membership.
- Organization switching/access currently checks `am_user_org`/`am_users`.
- CHUB automated delivery currently relies on the SystemSender bridge and cross-process wake-up behavior.

These are compatibility facts to preserve while changing process/repository ownership. They are **not** approval to let the new standalone service query ERP-owned tables permanently.
