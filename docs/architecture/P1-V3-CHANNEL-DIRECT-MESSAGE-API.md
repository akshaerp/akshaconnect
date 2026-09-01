# P1-V3 Channel + Direct Message API

**Checkpoint:** P1-V3
**Base:** `72675b838b9953d627746f9dc39801c13496f55c`
**Version:** `0.9.0-phase1`

## Goal

Expose the first collaboration discovery/creation APIs for pure standalone AkshaConnect while preserving the workspace boundary established in P1-V1 and the trusted LOCAL session boundary established in P1-V2.

P1-V3 intentionally does **not** add message sending/history. Durable messages remain P1-V5.

## API surface

```text
GET  /api/v1/workspace/members
GET  /api/v1/channels
POST /api/v1/channels
GET  /api/v1/direct-messages
POST /api/v1/direct-messages
```

All endpoints require the P1-V2 bearer session. The server derives `workspace_id` and the acting `workspace_member_id` from verified session claims. Caller-supplied workspace scope is never authoritative.

## Channel rules

- only active workspace members can list channels
- PUBLIC active channels are discoverable by active workspace members
- PRIVATE channels are returned only to current channel members
- OWNER, ADMIN and MEMBER workspace roles can create channels
- GUEST cannot create channels
- the creator becomes channel OWNER
- channel codes are normalized and unique case-insensitively within one workspace

P1-V3 does not yet add channel join/invite/member-management operations.

## Direct-message rules

A direct message is one canonical conversation per pair of workspace members.

`ac_direct_message` owns the structural pair identity:

```text
(workspace_id, member_a_id, member_b_id)
```

The lower UUID is always `member_a_id` and the higher UUID is always `member_b_id`. The primary key therefore prevents duplicate DM pairs even under concurrent creation attempts.

The table also carries `conversation_type = 'DM'` and references the conversation through a type-aware composite foreign key. A row cannot point to a CHANNEL or GROUP_DM conversation.

Both participants are inserted into `ac_conversation_participant` when a new DM is created.

Starting the same DM again returns the existing conversation instead of creating a duplicate.

## Workspace isolation

P1-V3 accepts only opaque target/channel identifiers from callers. Every repository operation receives the workspace from verified session claims and scopes SQL by that workspace.

A member ID from another workspace is therefore treated as an invalid DM target.

No AkshaERP tenant, organization, role, function, module, table, or security identifier appears in the collaboration contract.

## Supporting member discovery

`GET /api/v1/workspace/members?query=<text>&limit=<n>` exposes the existing provider-neutral LOCAL member search so the P1-V4 UI can select a DM target without knowing database internals.

The endpoint still binds the search to the verified workspace/member claims.

## Transaction boundaries

Channel creation is one transaction:

```text
conversation
-> channel
-> creator channel membership
```

DM creation is one transaction:

```text
DM conversation
-> canonical ac_direct_message pair
-> two conversation participants
```

A concurrent duplicate DM pair loses on `pk_ac_direct_message`; the losing request rolls back and resolves the already-created conversation.

## Exit criteria

- P1-V3 migration and verification pass in the standalone `akshaconnect` database
- channel code uniqueness is case-insensitive per workspace
- active members can create/list channels under trusted workspace scope
- guests cannot create channels
- private channel discovery is membership-bound
- active members can start/list direct messages under trusted workspace scope
- cross-workspace DM targets fail closed
- one canonical DM conversation exists per workspace member pair
- repeated/concurrent start requests do not create duplicate DM pairs
- API tests and full repository verification pass
