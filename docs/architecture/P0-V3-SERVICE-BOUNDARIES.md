# P0-V3 Standalone Service Boundaries

**Checkpoint:** P0-V3  
**Standalone base:** `3c95c8b37862c1311303d7dce30ab690301e3f02`  
**ERP audit baseline:** `21f72ba86bb1cb2e09012285a7b01d71a45280e0`

P0-V3 turns the P0-V2 extraction decisions into executable standalone ports. It deliberately does **not** copy ERP Access Management, CHUB, Push Notification or ERP-record repositories.

## Implemented ports

| Port | AkshaConnect uses it for | Implementation owner |
| --- | --- | --- |
| `identityGateway` | token verification and organization-scoped user search | AkshaERP integration adapter |
| `erpGateway` | ERP record lookup and business action requests | AkshaERP secured integration adapter |
| `notificationPort` | queueing mobile push work | AkshaConnect |

The service refuses to start its integration boundary if a required port is absent or incomplete.

## Verified request context

`verifiedRequestContext` is created only from claims returned by `identityGateway.verifyAccessToken()`. It contains:

- `user_id`
- `tenant_id`
- `active_organization_id`
- optional `active_branch_id`
- `session_id`

The context is frozen and tracked internally by the module. A client-created object containing the same fields is not treated as trusted context.

## Trust rule

Client payloads may provide search text, entity/action identifiers and UI metadata, but they do not choose the authoritative tenant, organization, branch or acting user. Those values are rebound from the verified context before any gateway call.

## ERP action rule

`executeErpAction()` only constructs a request. AkshaERP remains authoritative and must revalidate workflow state, permission, segregation-of-duties rules and record status before mutating any ERP record.

## Explicitly not implemented in P0-V3

- no direct `am_users`, `am_user_org` or HR-table access
- no direct CHUB service import
- no direct ERP Application Management push import
- no production HTTP adapter yet
- no copied collaboration persistence yet
- no production token verifier yet

Those omissions are intentional extraction gates, not missing fallback behavior.
