# Phase 0 Current-State Audit

**Baseline date:** 31 August 2026  
**Source system:** `akshaerp/aksha`  
**Target product:** `akshaerp/akshaconnect`

## 1. Audit conclusion

AkshaConnect in AkshaERP is already a meaningful collaboration subsystem, not a blank prototype. The standalone extraction must preserve behavior before replacing implementation.

The current codebase includes evidence of:

- Workspaces and channels
- Public/private channels, DMs, group DMs, and entity channels
- Channel membership and user-channel state
- Message persistence, replies/threads, edits, mentions, reactions
- Attachments and file-oriented UI
- Search and retention/encryption work
- User directory integration
- Realtime WebSocket delivery and cross-process relay
- CHUB delivery into AkshaConnect
- First-class SystemSender behavior
- Document/report artifact attachment bridging
- Application push-notification integration

## 2. Current implementation inventory

### Embedded web client

Known paths include:

- `client/src/router/routes/AkshaConnectRoutes.js`
- `client/src/modules/AkshaConnect/Collaboration/components/AcnConnectLauncher.js`
- `client/src/modules/AkshaConnect/Collaboration/components/AcnWorkspaceSetup.js`
- `client/src/modules/AkshaConnect/Collaboration/components/AcnSearchPanel.js`
- `client/src/modules/AkshaConnect/Collaboration/components/AcnFilesDrawer.js`
- `client/src/modules/AkshaConnect/Collaboration/utils/acnDraftStore.js`
- `client/src/modules/AkshaConnect/Collaboration/graphql/acnCollaborationQueries.js`
- `client/src/modules/AkshaConnect/UserDirectory/components/AcnUserAutocomplete.js`
- `client/src/modules/AkshaConnect/UserDirectory/graphql/acnUserDirectoryQueries.js`

### Collaboration service/server

Known paths include:

- `server/src/modules/AkshaConnect/Collaboration/services/acnCollaborationServiceV2.js`
- `server/src/modules/AkshaConnect/Collaboration/repositories/acnCollaborationRepositoryV2.js`
- `server/src/modules/AkshaConnect/Collaboration/graphql/acnCollaborationResolvers.js`
- `server/src/modules/AkshaConnect/Collaboration/routes/acnAttachmentRoutes.js`
- `server/src/modules/AkshaConnect/Collaboration/services/acnRetentionService.js`
- `server/src/modules/AkshaConnect/Collaboration/services/acnMessageCryptoService.js`
- `server/src/modules/AkshaConnect/UserDirectory/services/acnUserDirectoryService.js`

### Realtime

Known paths include:

- `server/src/modules/AkshaConnect/Collaboration/realtime/acnRealtimeServer.js`
- `server/src/modules/AkshaConnect/Collaboration/realtime/acnRealtimeHub.js`
- `server/src/modules/AkshaConnect/Collaboration/realtime/acnCrossProcessRealtimeRelay.js`

### Core Sequelize models observed

- Workspace
- Channel
- Channel member
- Channel/entity link
- Message
- Message edit/revision
- Message mention
- Message reaction
- User-channel state/read counters
- Message attachment

### Database packaging and hardening

Known paths include:

- `database/modules/acn/migrations/010000_acn_pre_schema.sql`
- `database/modules/acn/post_migrations/090000_acn_post_schema.sql`
- `database/modules/acn/post_migrations/202608191710__acn_v2_security_retention_encryption_search.sql`
- `database/modules/acn/post_migrations/202608231115__acn_v22_productivity.sql`
- `database/modules/chub/post_migrations/202608231300__chub_acn_bridge_hardening.sql`
- `database/modules/chub/post_migrations/202608091900__chub_template_akshaconnect_variants.sql`

The base ACN schema already shows tenant/organization context on durable collaboration records and contains tables such as `acn_channels`, `acn_channel_members`, `acn_messages`, `acn_message_edits`, `acn_message_mentions`, `acn_message_reactions`, `acn_message_attachments`, `acn_user_channel_state`, and `acn_channel_entity_links`.

## 3. CHUB and SystemSender inventory

Known integration paths:

- `server/src/modules/CommunicationHub/Outbox/services/chubOutboxProcessor.js`
- `server/src/modules/CommunicationHub/Outbox/services/chubAcnSystemSenderBridge.js`
- `server/src/modules/CommunicationHub/Outbox/services/chubAcnDocArtifactAttachmentBridge.js`
- `server/src/workers/chubOutboxRunner.js`

### SystemSender invariants that must not regress

1. Automated ERP messages are represented as a **SYSTEM** sender, not as a fabricated employee.
2. The compatibility pseudo user ID is worker-memory plumbing only; it must not become an AkshaConnect human user identity.
3. The durable SYSTEM channel member uses `member_type_code = SYSTEM` with no human `user_id`.
4. Actual recipient user IDs are still validated against the target organization.
5. ERP actor/owner metadata is preserved separately from the message sender so audit context is not lost.
6. System DMs use a deterministic recipient-based key so repeated automated messages reuse the intended conversation rather than creating uncontrolled duplicates.
7. SystemSender behavior must be applied before the cross-process realtime publisher bridge wraps the final `sendMessage` implementation.
8. Automated messages must remain capable of waking realtime browser/mobile clients, not merely writing to the database.

### Current CHUB endpoint compatibility invariant

Organization-wide channel endpoints may have `branch_id = NULL`. Current ERP compatibility logic explicitly handles "current branch OR organization-wide" semantics; the standalone integration must not accidentally require a branch-specific endpoint.

## 4. Ownership decision

| Capability | During extraction | Target owner |
| --- | --- | --- |
| Embedded React AkshaConnect UI | AkshaERP compatibility client | AkshaConnect web |
| Channels/conversations/messages | AkshaERP current implementation | AkshaConnect |
| Message read state/reactions/threads | AkshaERP current implementation | AkshaConnect |
| Collaboration attachments | AkshaERP current implementation | AkshaConnect |
| Realtime gateway/presence | AkshaERP current implementation | AkshaConnect |
| Device registration/push state | Transitional | AkshaConnect |
| Employee/user identity | AkshaERP | AkshaERP |
| Tenant/org/branch authority | AkshaERP | AkshaERP |
| Roles and ERP permissions | AkshaERP | AkshaERP |
| Workflow/approval authorization | AkshaERP | AkshaERP |
| Reporting generation | AkshaERP | AkshaERP |
| JBM scheduling/execution | AkshaERP | AkshaERP |
| CHUB routing/escalation | AkshaERP | AkshaERP |
| ERP event/action schemas | Shared versioned contract | Shared contract |
| System-generated message materialization | Transitional bridge | AkshaConnect from ERP event |

## 5. What V1 deliberately does not do

- It does not copy production collaboration services into the new repository yet.
- It does not point the standalone service directly at AkshaERP tables.
- It does not duplicate ERP authentication or approval logic.
- It does not change the current embedded AkshaConnect deployment.
- It does not promise schema migration before reconciliation tests exist.

These restrictions are intentional. Phase 0 first creates a stable receiving repository, contracts, tests, and extraction map.
