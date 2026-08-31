# Authentication and Tenant Context Contract V1

**Status:** Phase 0 proposed boundary. This document defines the target contract; it does not claim the current ERP token already contains every field below.

## Principle

AkshaERP remains the identity authority. AkshaConnect validates a short-lived credential issued/accepted by the AkshaERP identity boundary and builds a request context from verified claims.

## Minimum authenticated context

```json
{
  "user_id": 2,
  "tenant_id": "VISALAANDHRA",
  "active_organization_id": 11,
  "active_branch_id": 16,
  "session_id": "opaque-session-reference"
}
```

`active_branch_id` may be null for operations that are legitimately organization-wide.

## Required security behavior

1. Never accept tenant/org/user identifiers from an unverified client header as authority.
2. Every collaboration query is tenant/organization scoped.
3. Channel membership is checked in addition to tenant context.
4. Switching organization creates a new effective request context; cached conversation data from the previous context must not leak.
5. ERP business actions are re-authorized by AkshaERP even if AkshaConnect already authenticated the user.
6. Refresh/session revocation must support remote logout.
7. Tokens, secrets, message bodies, and attachment URLs must not be written to normal logs.

## Service-to-service calls

AkshaConnect→AkshaERP requests should carry:

- authenticated service identity
- end-user identity/context when acting on behalf of a user
- correlation ID
- idempotency/action-attempt ID when mutating
- contract version

The receiving ERP service is authoritative and may reject stale or unauthorized requests.
