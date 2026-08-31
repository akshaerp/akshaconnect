# P0-V2 Exact AkshaERP AkshaConnect Inventory

Pinned source: `akshaerp/aksha@21f72ba86bb1cb2e09012285a7b01d71a45280e0`.

This inventory refines the broad V1 audit into a file-level migration inventory. The machine-readable source of truth is `P0-V2-EXTRACTION-MAP.json`.

## Inventory totals

- Files/integration points classified: **89**
- `MOVE`: **34**
- `ADAPT`: **34**
- `KEEP_IN_ERP`: **13**
- `SHARED_CONTRACT`: **2**
- `TRANSITIONAL`: **5**
- `DEPRECATE_LATER`: **1**

## Confirmed collaboration server surface

The pinned ERP tree contains:

- GraphQL collaboration + presence schemas/resolvers.
- 12 collaboration/presence Sequelize model/association files.
- V1 and V2 collaboration repositories, presence repository, and ERP record lookup repository.
- V1 and V2 collaboration services, attachment storage, crypto, presence, retention and ERP record lookup services.
- Realtime hub/server, presence socket tracker and cross-process relay.
- Authenticated attachment routes and attachment security helpers.
- Separate AkshaConnect UserDirectory GraphQL/service/repository implementation.

The GraphQL schema already exposes workspaces, channels, channel members, messages, threads, reactions, attachments, user read state, activity inbox, saved/pinned messages, ERP record lookup, message search, presence and status. This is a compatibility baseline, not a blank-slate API design.

## Confirmed embedded web surface

The pinned ERP tree contains 22 collaboration components plus GraphQL operations, realtime hook and utilities. Major user-visible capabilities include:

- Activity/inbox
- Public/private channels
- Direct and group direct messages
- Member management
- Rich composer and rich-text rendering
- Conversation list/header
- Threads
- Reactions through message UI/API
- Search
- Files
- Saved and pinned messages
- Presence/status
- ERP entity conversation creation
- ERP event cards
- Draft persistence
- Realtime updates

## Database evolution observed

The ACN module has a base pre-schema plus post-schema and later hardening/productivity/presence migrations. P0-V2 deliberately marks these `ADAPT`, because the standalone repository needs a clean migration chain and must not inherit ERP module packaging assumptions accidentally.

## Important conclusion

We should **not** copy the entire `server/src/modules/AkshaConnect` folder into the new repository. The domain is mature enough to reuse, but several central files directly import ERP Access Management, HR fallback data, ERP error/transaction utilities, Application Management push, or ERP JWT/database authorization. Those seams must become explicit contracts first.
