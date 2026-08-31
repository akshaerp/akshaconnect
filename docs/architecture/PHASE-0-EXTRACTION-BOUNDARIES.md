# Phase 0 Extraction Boundaries

## Objective

Move AkshaConnect from an ERP-embedded collaboration subsystem to an independently deployable product without creating two sources of truth or breaking CHUB/SystemSender/realtime behavior.

## Boundary rules

### Rule 1 — collaboration moves; business authority stays

AkshaConnect may own:

- workspaces
- channels and membership
- conversations and messages
- threads, mentions and reactions
- read state/unread counters
- collaboration attachments
- presence/realtime connection state
- device registrations and push preferences

AkshaERP continues to own:

- users/employees
- tenants, organizations and branches
- roles and ERP permissions
- workflow definitions and approval decisions
- business transactions
- reports and artifacts
- scheduled jobs
- CHUB external escalation policy

### Rule 2 — no copied approval rules

An AkshaConnect action card can render `Approve`, `Reject`, or another ERP action, but it does not decide authorization. The client/service submits an authenticated action request to AkshaERP. AkshaERP revalidates user, organization, record state, workflow state, segregation of duties, and expiry before changing the record.

### Rule 3 — no target-state direct database coupling

The target architecture uses secured service APIs/events between products. Temporary migration/compatibility tooling may read legacy data under controlled scripts, but normal standalone runtime code must not query AkshaERP business tables directly.

### Rule 4 — SystemSender is a semantic contract

`SYSTEM` is an identity class, not a special human account. The standalone database must represent system/module/bot senders without manufacturing employee rows.

### Rule 5 — idempotency is mandatory

Every ERP-originated event carries a stable `event_id`. AkshaConnect must eventually enforce exactly-once materialization semantics at the message/event reference boundary even when delivery is retried.

## Extraction sequence

### P0.1 — repository foundation (this V1)

- runnable API health/readiness service
- CI verification
- Docker baseline
- JavaScript-only baseline
- versioned ERP event contract
- current-state audit
- auth/tenant contract

### P0.2 — regression capture in AkshaERP

Before moving production collaboration code, capture or confirm regression tests for:

- human DM and channel send
- SystemSender DM
- SystemSender entity channel
- recipient organization validation
- attachment send/download authorization
- read/unread state
- duplicate CHUB delivery/idempotency
- cross-process realtime wake-up
- organization-wide CHUB endpoint resolution with branch context present

### P0.3 — integration adapter

Add a versioned AkshaERP→AkshaConnect adapter behind a feature flag. Initially it can mirror or shadow current behavior while the embedded client remains active.

### P0.4 — collaboration persistence extraction

Move collaboration-owned schema/services only after parity tests can run against old and new paths. Historical message migration must reconcile counts, senders, timestamps, memberships, attachments, entity links, and read state.

### P0.5 — standalone clients

Start the web and React Native shells after auth context and core messaging APIs are proven. The ERP embedded launcher can then deep-link into the standalone product.

## Fail-closed rules

The standalone service must reject rather than guess when:

- tenant context is absent
- organization context is absent for organization-bound operations
- recipient scope cannot be verified
- event contract version is unsupported
- ERP action authorization cannot be confirmed
- an action is expired/revoked/stale
- an attachment authorization check cannot be completed
