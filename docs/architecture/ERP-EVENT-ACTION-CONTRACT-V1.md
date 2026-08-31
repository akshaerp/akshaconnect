# ERP Event and Action Contract V1

## Event envelope

The Phase 0 code exposes contract version `1.0` in `packages/contracts`.

Minimum event fields:

| Field | Required | Meaning |
| --- | --- | --- |
| `contract_version` | yes at wire boundary | Contract version (`1.0`) |
| `event_id` | yes | Stable idempotency identifier |
| `event_type` | yes | Workflow/report/alert/job classification |
| `tenant_id` | yes | Tenant isolation |
| `organization_id` | yes | Organization context |
| `branch_id` | no | Optional branch context |
| `recipient_type` | yes | USER, ROLE, GROUP, CHANNEL |
| `recipient_ids` | yes | Non-empty target references |
| `sender_type` | yes | HUMAN, SYSTEM, MODULE, BOT |
| `sender_reference` | yes | Authoritative sender reference/code |
| `title` | yes | User-facing title |
| `summary` | yes | User-facing summary |
| `entity_type` | no | ERP entity type |
| `entity_id` | no | ERP entity ID |
| `actions` | no | Renderable action descriptors |
| `deep_link` | no | Web/mobile target |
| `expires_at` | no | Optional action expiry |
| `correlation_id` | yes | Cross-system trace identifier |
| `created_at` | yes | Source timestamp |

## Sender rule

A `SYSTEM` event must remain a system identity when materialized. Do not map it to a human employee solely to satisfy a legacy `sender_user_id` expectation.

## Idempotency rule

`event_id` is the durable deduplication key for ERP-originated event materialization. Retries with the same event ID must not create duplicate user-visible messages.

## ERP action request (target shape)

A future action request should contain at least:

```json
{
  "contract_version": "1.0",
  "action_attempt_id": "unique-attempt-id",
  "event_id": "original-event-id",
  "correlation_id": "original-correlation-id",
  "tenant_id": "VISALAANDHRA",
  "organization_id": 11,
  "branch_id": 16,
  "user_id": 2,
  "entity_type": "SALES_ORDER",
  "entity_id": 1045,
  "action_code": "APPROVE",
  "client_context": {
    "surface": "MOBILE"
  }
}
```

AkshaERP must treat this as a request, not proof of authorization. ERP rechecks record state and permission before performing the mutation.
