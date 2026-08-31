# P0-V2 Dependency and Extraction Risks

## 1. Identity leakage through direct database imports — HIGH

`acnCollaborationRepository.js`, `acnCollaborationRepositoryV2.js`, `acnUserDirectoryRepository.js`, `acnPresenceRepository.js` and realtime authorization currently depend directly or indirectly on Access Management tables/models. A blind move would make AkshaConnect a hidden second ERP process sharing internal tables.

**Gate:** moved code must depend on an `identityGateway`/verified request context, not `amUserModel`, `am_user_org` or `hr_employees`.

## 2. Realtime authentication coupling — HIGH

The current realtime hub verifies tokens with the ERP `JWT_SECRET` and checks ERP organization membership tables. This is safe inside the current ERP process boundary but is not the final standalone contract.

**Gate:** define token issuer/audience/expiry/session-revocation behavior before standalone realtime accepts production users.

## 3. CHUB shared-database wake-up coupling — HIGH

The cross-process relay solves a current topology problem: CHUB can persist a message in another Node process and wake the live WebSocket process using PostgreSQL notifications. That should not become the permanent cross-product integration.

**Gate:** CHUB sends an idempotent ERP event to AkshaConnect, AkshaConnect persists it, then its own realtime service publishes it.

## 4. Push notification ownership — MEDIUM/HIGH

Current collaboration services call `ApplicationManagement/PushNotifications`. A separate mobile product needs its own device registrations, platform tokens, preferences and worker lifecycle.

**Gate:** do not cross-import the ERP push service. Define a local notification port and implement it inside AkshaConnect.

## 5. ERP record lookup — HIGH

Entity conversation creation can search ERP records. Moving the lookup repository would duplicate module knowledge and database permissions.

**Gate:** keep lookup in ERP behind a versioned secured integration API.

## 6. ERP event card navigation — MEDIUM

`AcnErpEventCard` currently opens relative ERP routes through React Router. Standalone web/mobile needs a deep-link contract capable of choosing ERP web, native route, or protected artifact action.

**Gate:** normalize `deep_link`/action descriptors before mobile rollout.

## 7. Database history vs clean standalone migrations — MEDIUM

ERP ACN migrations are valuable truth but include module-packaging assumptions. Replaying them unchanged can create a brittle standalone install.

**Gate:** produce a reconciled baseline migration and migration-reconciliation test before moving production data.

## 8. Embedded launcher coupling — LOW/MEDIUM

The launcher imports ERP Redux user state and Application Management badge utility. It should remain as a compatibility entry point, not become the standalone application shell.
