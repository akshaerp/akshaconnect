# P1-V1 Collaboration Persistence Boundary

## Decision

P1-V1 creates the first production-shaped collaboration persistence schema for standalone AkshaConnect.

The schema is provider-neutral. AkshaERP identifiers are never primary keys for AkshaConnect identities, members, conversations, channels, or messages.

## Database ownership boundary

AkshaConnect uses its own PostgreSQL database. It may be hosted on the same PostgreSQL server as another product during development, but it is a separate logical database and schema ownership boundary.

```text
PostgreSQL server
├── akshaerp       # AkshaERP-owned
└── akshaconnect   # AkshaConnect-owned
```

AkshaConnect persistence must not create foreign keys, views, joins, or direct table dependencies into an AkshaERP database. Cross-product access occurs only through provider/connector contracts.

## Identity model

`ac_identity` is the AkshaConnect-owned identity record. AkshaConnect internal identity is not an AkshaERP user ID.

`ac_identity_provider_link` associates that identity with an external authentication provider:

```text
provider_code = LOCAL | AKSHAERP | future provider
external_subject = provider-owned opaque identifier
```

`external_subject` is intentionally text, not an integer, so providers may use numeric IDs, UUIDs, OIDC subjects, emails, or other stable identifiers.

`ac_workspace_member` grants an identity membership in a workspace.

## Conversation model

`ac_conversation` is the common message container.

Conversation types:

- `CHANNEL`
- `DM`
- `GROUP_DM`

Channel metadata lives in `ac_channel`. Direct/group participants live in `ac_conversation_participant`. Messages always point to a conversation, avoiding separate message tables for channels and DMs.

## Workspace isolation

Collaboration tables carry `workspace_id`.

Parent tables expose composite unique keys such as:

```text
(workspace_id, conversation_id)
(workspace_id, workspace_member_id)
(workspace_id, message_id)
```

Child tables reference these composite keys. This means a row from workspace A cannot legally point to a conversation/member/message owned by workspace B even if an application bug supplies the wrong identifier.

Message relationships are additionally conversation-scoped: a reply cannot target a message from another conversation, and a read cursor cannot point at a message from another conversation in the same workspace.

Identity and identity-provider-link tables are intentionally global account registries; they enter a tenant only through `ac_workspace_member`.

## Sender model

A message is either:

```text
sender_type = HUMAN
    sender_member_id IS NOT NULL
    system_sender_id IS NULL

sender_type = SYSTEM
    sender_member_id IS NULL
    system_sender_id IS NOT NULL
```

The database check constraint prevents a fabricated human sender for system-generated events.

## Idempotency

Human/client sends may provide `client_message_id`; the database allows it only once per workspace + conversation.

Provider events are recorded in `ac_event_receipt` using:

```text
(workspace_id, source_provider, event_id)
```

This supports replay-safe SystemSender/event processing without assuming AkshaERP is the source.

## Deferred from P1-V1

P1-V1 deliberately does not implement authentication/session tables, GraphQL collaboration APIs, repository/service code, WebSocket delivery, UI, attachments, reactions/threads/search, or notification delivery. Those are subsequent Phase 1 checkpoints.
