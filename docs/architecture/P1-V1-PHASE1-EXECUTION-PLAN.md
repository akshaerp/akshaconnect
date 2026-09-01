# AkshaConnect Phase 1 Execution Plan

**Phase:** Phase 1 — Standalone Minimum Viable Application
**Starting checkpoint:** P0-V6D
**Standalone base:** `6ee551f8d63f0b9d56f2f0f7b661d89f226ffb6d`
**Status:** ACTIVE

## Product rule

AkshaConnect is an independent collaboration product. Phase 1 must work in pure standalone mode without AkshaERP.

AkshaERP is one optional identity/business provider. The collaboration core must not depend on AkshaERP module codes, function codes, tables, roles, or database identifiers.

AkshaConnect owns a separate PostgreSQL database. There are no cross-database foreign keys, views, joins, or direct AkshaERP table reads; providers integrate only through contracts.

## Why the UI moves earlier

Automated tests remain mandatory for tenant isolation, persistence, authorization, idempotency, pagination, and invalid input. However, a minimum functional web UI is required early so each backend capability can also be tested as a real user.

The Phase 1 sequence is therefore:

| Checkpoint | Scope | Practical acceptance |
| --- | --- | --- |
| P1-V1 | Collaboration persistence + tenant isolation | Schema/constraints/tests pass; two isolated workspaces can be seeded |
| P1-V2 | LOCAL identity + session bootstrap | User can sign in locally and obtain trusted workspace context |
| P1-V3 | Channel + direct-message APIs | Create/list channels and start/list DMs through API |
| P1-V4 | Minimum functional web UI | Login, workspace/channel sidebar, conversation view, composer |
| P1-V5 | Durable messaging | Send/history/pagination/read cursor/idempotency/SystemSender |
| P1-V6 | Realtime gateway | Two browser sessions receive ordered messages without refresh |
| P1-V7 | Web UX hardening | Unread counts, reconnect state, responsive layout, basic attachment UI |
| P1-V8 | Mobile shell | React Native login/navigation/message flow against same contracts |
| P1-V9 | Phase 1 E2E | web↔web, web↔mobile, restart/reconnect, tenant isolation, system sender, attachment smoke |

## Permanent testing model

Each feature must pass two gates:

1. **Automated gate** — deterministic tests for security, persistence, contract, and failure behavior.
2. **Practical UI gate** — use the current web test UI with two users/sessions to validate the user-visible behavior.

The UI is a product surface, not a substitute for security tests.

## P1-V1 scope

P1-V1 establishes the durable collaboration-owned data model:

- workspaces
- identities
- external identity-provider links
- workspace members
- conversations
- channels
- channel membership
- direct/group conversation participants
- system senders
- messages
- message revisions
- read cursors
- provider-event receipts/idempotency

### Identity rule

AkshaConnect internal identity is not an AkshaERP user ID.

```text
AkshaConnect identity
        |
        +-- LOCAL provider link
        +-- AKSHAERP provider link
        +-- future provider links
```

A workspace membership binds an identity to one tenant/workspace. Provider-specific subjects remain external references only.

### Tenant-isolation rule

All collaboration-owned records are workspace-scoped, and cross-workspace parent/child references are blocked with composite foreign keys. Global identities may participate in multiple workspaces only through explicit workspace membership.

## P1-V1 exit criteria

- migration is rerunnable only through normal migration bookkeeping, not by silently dropping/recreating data
- every collaboration-owned table has a clear workspace boundary
- no ERP table or ERP security identifier is referenced by the schema
- cross-workspace channel/member/conversation/message references are structurally rejected
- replies and read cursors cannot point to messages in another conversation
- human and system message senders are structurally distinguishable
- client message idempotency and external event idempotency are represented
- static architecture tests pass in `npm run verify`
- SQL verification script passes after the migration is executed in PostgreSQL
- no UI is required to accept P1-V1, but P1-V4 is deliberately early so subsequent capabilities are tested through UI as they are added
