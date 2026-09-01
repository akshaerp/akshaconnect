# AkshaConnect Standalone Product

## Product Architecture, Repository Decision and Delivery Roadmap

**Company:** AkshaERP Solutions Private Limited  
**Product:** AkshaConnect  
**Document status:** Initial approved direction  
**Date:** 31 August 2026

### P0-V6D supersession — 1 September 2026

P0-V6D establishes AkshaConnect as a provider-neutral standalone product. Earlier references in this roadmap that describe AkshaERP as the mandatory identity/business owner are historical Phase-0 assumptions. From P0-V6D onward:

- `LOCAL` identity with no business provider is a valid pure standalone deployment.
- AkshaERP is one optional identity/business provider through a connector.
- AkshaConnect owns its collaboration identity, workspace, membership, conversation, channel, message, read-state and collaboration data.
- Provider-specific module codes, function codes, tables, role models and security implementation details must not enter AkshaConnect core contracts.
- Phase 1 brings a minimum functional web UI forward so backend capabilities can be practically tested as they are built, while automated security/persistence tests remain mandatory.

---

## 1. Executive Decision

AkshaConnect should be developed as a **separate product repository** named:

```text
akshaerp/akshaconnect
```

It will provide:

- A standalone web application, proposed at `connect.akshaerp.com`
- A standalone Android application
- A standalone iOS application
- Optional Windows and macOS desktop applications later
- Embedded entry points inside AkshaERP where useful

This does **not** mean rebuilding or duplicating ERP business logic.

AkshaERP will remain the system of record for users, tenants, organizations, branches, roles, permissions, workflows, approvals, reports and business transactions. AkshaConnect will own conversations, channels, messages, message delivery, device registrations, presence, read state and collaboration-specific data.

### Decision summary

| Area | Owning system |
| --- | --- |
| Chat user experience | AkshaConnect |
| Channels, direct messages and groups | AkshaConnect |
| Messages, reactions, threads and read state | AkshaConnect |
| Mobile devices and push-token registration | AkshaConnect |
| Tenants, organizations, branches and employees | AkshaERP |
| Roles and access permissions | AkshaERP |
| Workflow and approval rules | AkshaERP |
| Sales, finance, inventory and other transactions | AkshaERP |
| Scheduled jobs | AkshaERP Job Management (JBM) |
| Report generation | AkshaERP Reporting |
| WhatsApp, email and SMS delivery | AkshaERP CHUB |
| ERP action cards displayed in chat | Shared integration contract |

This approach gives AkshaConnect independent mobile and web releases without splitting the source of truth or creating duplicate approval logic.

---

## 2. Product Vision

AkshaConnect will be an **enterprise operational collaboration platform** where employees communicate and complete work without repeatedly opening the full ERP.

It should combine the ease of WhatsApp, the workspace structure of Slack and the community/channel experience of Discord, while adding native AkshaERP actions.

### Core product statement

> AkshaConnect brings conversations, reports, alerts, workflow tasks and ERP approvals into one secure mobile and web application.

### Primary differentiator

AkshaConnect is not only a messenger. A user must be able to receive an operational message and act on the underlying business record from the same screen.

Examples:

- Approve or reject a sales order
- Approve an expense claim
- Review a purchase request
- Receive a daily circulation or sales report
- Acknowledge an inventory shortage
- Receive a failed-job alert from JBM
- Open the exact ERP transaction from the message
- Request clarification without leaving the conversation
- Escalate an unread urgent notification through CHUB

---

## 3. Why a Separate Repository

### Benefits

1. **Independent product releases:** Mobile and web releases will not require a full ERP deployment.
2. **Clear ownership:** Messaging and collaboration code will not become mixed with unrelated ERP screens.
3. **Mobile-first development:** React Native dependencies and app-store build pipelines remain isolated from the ERP frontend.
4. **Independent scaling:** Real-time connections, message delivery and media traffic can scale separately from ERP transactions.
5. **Future standalone sales:** AkshaConnect may later be offered to customers who use AkshaERP selectively or connect to third-party applications.
6. **Safer evolution:** The ERP can continue operating even when AkshaConnect is being upgraded.

### Why not keep everything inside the AkshaERP repository

Keeping the initial screen inside AkshaERP was useful for proving the concept. However, a full collaboration product introduces mobile builds, push notifications, offline synchronization, WebSocket infrastructure, media storage and frequent client releases. These have a different lifecycle from the ERP.

### Important boundary

The separate repository must not copy ERP services or database rules. For example, AkshaConnect may display an **Approve** button, but AkshaERP Workflow must validate and perform the approval.

---

## 4. Proposed Repository Structure

```text
akshaconnect/
├── apps/
│   ├── web/                 # React web application
│   └── mobile/              # React Native Android/iOS application
├── services/
│   ├── api/                 # GraphQL/REST application API
│   ├── realtime/            # WebSocket gateway and presence
│   └── notification-worker/ # Push and delivery processing
├── packages/
│   ├── contracts/           # Versioned event and action-card contracts
│   ├── sdk/                 # AkshaERP integration client
│   ├── ui/                  # Shared visual components and design tokens
│   └── validation/          # Shared request/event validation
├── database/
│   ├── migrations/
│   └── seeds/
├── infrastructure/
│   ├── docker/
│   ├── nginx/
│   └── deployment/
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── security/
│   └── testing/
├── scripts/
└── README.md
```

The implementation should continue using JavaScript to match the existing AkshaERP development approach unless a later architecture decision explicitly changes it.

---

## 5. System Architecture

### Client applications

- React web application
- React Native Android/iOS application
- Responsive layout for phone, tablet and desktop
- Local encrypted cache for recent conversations
- Offline message queue and retry
- Deep links into conversations and ERP records
- Push notifications using FCM and APNs

### AkshaConnect services

- Node.js application layer
- Apollo GraphQL for normal application operations
- WebSocket gateway for real-time message events
- Background worker for delivery, push and retries
- Redis for presence, connection state and event distribution when required
- PostgreSQL for durable collaboration data
- S3-compatible object storage for attachments and voice notes

### AkshaERP integration

- Existing AkshaERP identity and tenant context
- Secured, versioned service-to-service APIs
- Durable events for workflow tasks, reports, alerts and job results
- Idempotency keys to prevent duplicate system messages
- Signed action requests from AkshaConnect to AkshaERP
- AkshaERP revalidates the user and permission when an action is performed

### CHUB integration

AkshaConnect becomes a first-class CHUB delivery channel.

Recommended routing sequence:

1. Create the internal AkshaConnect message.
2. Deliver a mobile push notification.
3. Track delivered, read and actioned states.
4. If the configured deadline is crossed, escalate through WhatsApp, email or SMS.
5. Store all channel attempts under one correlation identifier.

---

## 6. Core Functional Scope

### 6.1 Workspace and identity

- Login through AkshaERP identity
- Tenant and organization selection
- Branch-aware access
- User profile, status and availability
- Multiple device sessions
- Device management and remote logout
- Role- and permission-aware channel discovery

### 6.2 Conversations

- Direct messages
- Private groups
- Public and private channels
- Department, branch, project and process channels
- Message replies and threads
- Mentions and reactions
- Edit and delete according to policy
- Pin, bookmark and forward
- Read receipts and unread counts
- Search by text, sender, date, channel and attachment

### 6.3 Media and collaboration

- Images and documents
- Voice notes
- Link previews
- Attachment preview and download permissions
- Message-level comments against reports or ERP objects
- Configurable retention policies

### 6.4 System and ERP messages

- Explicit system-sender identity, never a fabricated human user
- Workflow task cards
- Approval and rejection actions
- Scheduled report cards
- Job success, failure and warning notifications
- Transaction summaries
- Deep links to the relevant ERP page
- Action expiry and already-actioned state
- Audit trail containing actor, action, timestamp and source device

### 6.5 Notifications

- In-app notifications
- Mobile push notifications
- Per-channel mute controls
- Mentions-only mode
- Quiet hours
- Urgent message policy
- Escalation through CHUB
- User and organization notification preferences

### 6.6 Administration

- Channel creation policy
- Member and moderator management
- Message retention
- File restrictions
- Guest access policy
- Audit search and export
- Device-session administration
- System health and delivery monitoring

---

## 7. ERP Action Card Contract

An ERP card should be data-driven so new AkshaERP modules can publish actionable messages without changing the mobile application for every transaction type.

Minimum contract fields:

| Field | Purpose |
| --- | --- |
| `event_id` | Globally unique idempotency identifier |
| `event_type` | Workflow, report, alert or job-result classification |
| `tenant_id` | Tenant isolation |
| `organization_id` | Organization context |
| `branch_id` | Optional branch context |
| `recipient_type` | User, role, group or channel |
| `recipient_ids` | Intended recipients |
| `sender_type` | Human, system, module or bot |
| `sender_reference` | Authoritative sender identity |
| `title` | Short user-facing title |
| `summary` | Human-readable content |
| `entity_type` | Sales order, expense, report, job and so on |
| `entity_id` | Authoritative ERP record identifier |
| `actions` | Allowed actions and labels |
| `deep_link` | Target web/mobile route |
| `expires_at` | Optional action expiry |
| `correlation_id` | Cross-system trace identifier |
| `created_at` | Source timestamp |

The client must never decide that an approval is valid solely because a button is visible. On every action, AkshaERP must recheck record status, authorization, segregation of duties and workflow rules.

---

## 8. Initial Data Model

The detailed schema will be produced after auditing the current AkshaConnect tables. The initial logical entities are:

- Workspaces
- Channels
- Channel members
- Conversations
- Conversation participants
- Messages
- Message revisions
- Threads
- Reactions
- Read cursors
- Attachments
- Device registrations
- Notification preferences
- Delivery attempts
- Presence sessions
- ERP message references
- ERP action attempts
- Audit events

Every durable table must contain tenant context directly or through a strictly enforced parent relationship. Cross-tenant queries must be prevented and covered by automated tests.

---

## 9. Security and Governance

### Required from the first production release

- TLS for all network traffic
- Encryption at rest for databases, backups and attachments
- Short-lived access tokens and controlled refresh tokens
- Tenant isolation at service and database-query levels
- Permission validation by AkshaERP for business actions
- Signed service-to-service communication
- Rate limiting and abuse protection
- Malware/type/size validation for uploaded files
- Complete audit trail for administrative and ERP actions
- Remote device logout
- Backup and restore procedure
- Secret rotation procedure
- No sensitive payloads written to normal application logs

### End-to-end encryption decision

AkshaConnect should initially use strong encryption in transit and at rest, but not promise WhatsApp-style end-to-end encryption in Phase 1. Enterprise search, audit, legal retention, workflow cards and server-generated reports conflict with a simple E2EE design. Optional confidential conversations can be evaluated later as a separate architecture decision.

---

## 10. Delivery Roadmap

### Phase 0 — Current-state audit and extraction plan

**Goal:** Preserve the AkshaConnect work already completed and identify clean extraction boundaries.

Deliverables:

- Inventory current frontend, GraphQL, Sequelize, SQL and CHUB integrations
- Document the current SystemSender behavior and tests
- Identify reusable code versus ERP-owned code
- Map existing tables to the target data model
- Define authentication and tenant-context contract
- Define versioned ERP event and action APIs
- Create the new repository with CI, linting, tests and Docker baseline

Exit criteria:

- Current AkshaConnect test cases pass
- No existing feature is silently dropped
- Ownership of each component is documented
- The new repository can start locally with a health check

### Phase 1 — Standalone minimum viable application

**Goal:** Users can independently open AkshaConnect and communicate reliably in pure standalone mode or with an optional identity/business provider.

**Development sequence:**

1. **P1-V1 — Collaboration persistence + tenant isolation**
   - workspace, identity/provider-link and membership foundation
   - channels, conversations and participants
   - messages, revisions, read cursors and SystemSender
   - client/event idempotency
   - structural cross-workspace protection

2. **P1-V2 — LOCAL identity + session bootstrap**
   - standalone login/session foundation
   - trusted workspace context
   - provider-neutral identity contract
   - optional AkshaERP identity adapter remains behind the provider boundary

3. **P1-V3 — Channel + direct-message APIs**
   - channel create/list/membership
   - direct-message creation/discovery
   - authorization and tenant-isolation tests

4. **P1-V4 — Minimum functional web UI**
   - login
   - workspace/channel/direct-message sidebar
   - conversation history
   - message composer
   - enough UI to test each subsequent backend feature with two browser sessions

5. **P1-V5 — Durable messaging**
   - send/history/pagination
   - read cursors/unread state
   - duplicate protection
   - SystemSender

6. **P1-V6 — Realtime gateway**
   - WebSocket connect/send/receive
   - ordering
   - reconnect/resume without duplicate messages

7. **P1-V7 — Web UX hardening**
   - responsive layout
   - reconnect state
   - unread counters
   - basic attachment UI

8. **P1-V8 — Mobile shell**
   - React Native Android/iOS application shell
   - same identity/messaging contracts
   - device registration and push foundation

9. **P1-V9 — Full Phase-1 E2E**
   - web ↔ web
   - web ↔ mobile
   - reconnect/restart
   - tenant isolation
   - SystemSender
   - basic attachment smoke test

**Testing rule:** every checkpoint must have an automated gate and, once P1-V4 exists, a practical UI gate. UI clicking never replaces tenant/security/idempotency tests.

**Exit criteria:**

- Two users can exchange messages across web and mobile
- Messages survive reconnects and application restarts
- Duplicate events do not create duplicate messages
- Tenant-isolation tests pass
- A system message is distinguishable from a human message
- Pure `LOCAL` standalone mode works without AkshaERP network/configuration

### Phase 2 — Full collaboration experience

**Goal:** Reach a practical Slack/WhatsApp-style daily collaboration experience.

Deliverables:

- Groups and private channels
- Threads, mentions and reactions
- Search
- Voice notes and improved file previews
- Presence and typing indicators
- Notification preferences and quiet hours
- Offline queue, retry and synchronization
- Channel administration and moderation

Exit criteria:

- Staff can use AkshaConnect for normal internal communication
- Mobile behavior is reliable on intermittent networks
- Search and retention rules behave according to tenant policy

### Phase 3 — ERP actions and workflow

**Goal:** Make AkshaConnect operationally different from ordinary messengers.

Deliverables:

- Generic ERP action-card renderer
- WFM/BPM task delivery
- Approve, reject and request-clarification actions
- Record deep links
- Permission and status revalidation
- Actioned, expired and revoked states
- Auditable action results returned to the conversation

Exit criteria:

- An authorized user can complete a real approval from mobile
- An unauthorized or stale action is safely rejected
- ERP and AkshaConnect audit histories correlate correctly

### Phase 4 — Reporting, JBM and CHUB orchestration

**Goal:** Deliver scheduled operational intelligence and escalation.

Deliverables:

- JBM job-result messages
- Scheduled report cards and protected downloads
- Delivery/read/action deadline tracking
- CHUB escalation policies
- WhatsApp, email and SMS fallback
- Delivery dashboard and retry administration

Exit criteria:

- A scheduled JBM report reaches intended AkshaConnect users
- Failures are retried and visible to administrators
- Unread urgent messages escalate according to policy
- One correlation ID traces the full delivery lifecycle

### Phase 5 — Enterprise and external collaboration

**Goal:** Prepare AkshaConnect for wider commercial use.

Possible scope:

- Guest/customer/vendor spaces
- Federation or controlled external workspaces
- Voice and video calls
- Screen sharing
- Bot and integration framework
- Desktop packaging
- Compliance exports and legal hold
- Third-party ERP connectors
- Usage analytics and commercial subscription controls

This phase must be prioritized using customer demand rather than attempting to clone every competitor feature.

---

## 11. Migration Strategy for Existing AkshaConnect

The current implementation should not be rewritten blindly.

1. Stabilize and test the current SystemSender and messaging flow.
2. Record current API and database behavior with regression tests.
3. Create versioned contracts between AkshaERP and AkshaConnect.
4. Move collaboration-owned services and screens into the new repository incrementally.
5. Keep temporary compatibility endpoints inside AkshaERP during migration.
6. Run old embedded and new standalone clients against controlled test data.
7. Switch users to the standalone application after parity is proven.
8. Retain a lightweight AkshaConnect entry point inside AkshaERP that opens the standalone experience.

Historical messages must be migrated with their sender, tenant, conversation, timestamps, attachments and ERP references intact.

---

## 12. Testing Strategy

### Mandatory automated coverage

- Unit tests for messaging and permission rules
- GraphQL/API contract tests
- WebSocket reconnect and ordering tests
- Idempotency and duplicate-event tests
- Tenant-isolation tests
- Role and branch access tests
- SystemSender regression tests
- Push-notification delivery tests
- Offline synchronization tests
- Attachment authorization tests
- ERP approval success, stale-state and unauthorized-action tests
- JBM report delivery and CHUB escalation tests
- Migration reconciliation tests

### End-to-end pilot scenario

The first business pilot should validate this complete flow:

1. JBM runs a scheduled report.
2. Reporting generates and stores the artifact.
3. CHUB routes the notification to AkshaConnect.
4. The system sender posts the report card in the correct channel.
5. The mobile user receives a push notification.
6. The user opens the protected report.
7. Delivery and read states are recorded.
8. A configured escalation occurs only if required.

The second pilot should cover a complete approval flow from ERP submission through mobile approval and final workflow status.

---

## 13. Initial Non-Functional Targets

These are engineering targets for the pilot and should be refined after measurement:

- No acknowledged message loss
- Idempotent processing of ERP-generated events
- Message visibility only within the correct tenant and authorized conversation
- Real-time delivery under normal network conditions
- Graceful reconnect without missing or duplicating messages
- Horizontal scalability for the real-time gateway and workers
- Observable delivery failures with safe retry
- Backward-compatible, versioned integration contracts
- Database and attachment backup with tested restoration

---

## 14. Product Boundaries for the First Release

### Included

- Internal employees and authorized AkshaERP users
- Web and Android/iOS applications
- Direct messages, channels and groups
- Push notifications
- Attachments and basic voice notes
- Workflow approvals
- Scheduled reports and job notifications
- CHUB escalation

### Deferred

- Public anonymous communities
- Gaming/community features unrelated to business operations
- Full Slack application marketplace
- Large-scale video conferencing
- WhatsApp-compatible end-to-end encryption claims
- Consumer phone-number discovery
- Federation across unrelated companies

Deferring these items keeps the first release focused on AkshaERP customers and a clear commercial advantage.

---

## 15. Commercial Positioning

AkshaConnect can be sold in three forms:

1. **Included collaboration layer:** Bundled with selected AkshaERP subscriptions.
2. **Premium operational collaboration:** Charged per active user for mobile approvals, reports, automation and escalation.
3. **Standalone enterprise integration:** Connected to customer systems through APIs and future connectors.

Its competitive message should focus on turning conversations into governed business actions, not on claiming to be a complete replacement for every feature in Slack, Discord or WhatsApp.

---

## 16. Immediate Next Actions

1. Complete the current AkshaConnect/SystemSender test case.
2. Review the latest AkshaERP Git state and catalogue existing AkshaConnect assets.
3. Create the `akshaerp/akshaconnect` repository.
4. Add this document as `docs/AKSHACONNECT-STANDALONE-ROADMAP.md`.
5. Create the Phase 0 repository skeleton and development standards.
6. Define the version-1 identity, event and ERP action contracts.
7. Build the standalone web shell before starting broad feature development.
8. Create the mobile shell against the same API contract.
9. Prove one direct-message flow and one SystemSender flow end to end.
10. Proceed to workflow and JBM/report integration only after the messaging foundation is reliable.

---

## 17. Final Recommendation

Proceed with a **separate AkshaConnect repository using a shared-platform architecture**.

- Separate repository and deployments for product independence
- Shared AkshaERP identity, permissions and business services for correctness
- Versioned events and APIs for clean integration
- Incremental migration of the work already completed
- Mobile-first delivery focused on communication plus real business actions

This structure gives AkshaConnect room to become a major standalone AkshaERP product without weakening the integrity of the ERP platform.
