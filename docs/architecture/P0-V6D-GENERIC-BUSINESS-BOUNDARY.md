# P0-V6D Generic Business Provider Boundary

**Checkpoint:** P0-V6D
**Standalone base:** `68047d8235b03116ff6065538ea483af4da876d9`
**Version:** `0.7.0-phase0`

## Decision

AkshaConnect is an independent collaboration product. AkshaERP is a provider, not a core dependency. The core business integration port therefore uses provider-neutral business concepts.

```text
AkshaConnect core
        |
        +-- identityGateway
        |
        +-- businessGateway
        |      +-- searchRecords()
        |      +-- executeAction()
        |
        +-- notificationPort
               |
               v
        provider adapters
        +-- NONE
        +-- AKSHAERP
        +-- future SAP / Oracle / Dynamics / custom adapters
```

## Generic record-search input

```text
tenant_id
organization_id
branch_id (optional AkshaConnect scope context)
actor_user_id
resource_type
query
limit
correlation_id
```

The core does **not** send `module_code`, `function_code` or provider security identifiers.

## Generic action input

```text
contract_version
action_attempt_id
event_id
correlation_id
tenant_id
organization_id
branch_id
actor_user_id
resource_type
resource_id
action
client_context.surface
```

`resource_id` is a string at the core boundary so providers may use numeric, UUID or external identifiers. A provider may apply a stricter native format after the boundary.

## Provider ownership

The AkshaERP adapter is allowed to know AkshaERP-specific paths, credentials, modules, functions, resources and authorization services. Those concepts must stay behind the adapter.

The same rule applies to future providers: SAP authorization objects, Oracle responsibilities or custom REST fields must never become AkshaConnect core contracts.

## Standalone guarantee

With:

```text
AKSHACONNECT_IDENTITY_PROVIDER=LOCAL
AKSHACONNECT_BUSINESS_PROVIDER=NONE
```

AkshaConnect must compose and operate without AkshaERP configuration or network access. Business-only calls fail explicitly with `BUSINESS_FEATURE_UNAVAILABLE`; collaboration remains valid.

## Security invariants

1. Tenant, organization, branch and actor identity are rebound from the verified request context; caller overrides are ignored.
2. Provider authorization remains provider-owned.
3. The generic core never queries provider databases or security tables directly.
4. Unsupported or unavailable business capabilities fail explicitly.
5. Provider transport errors remain normalized at the adapter boundary.

## Compatibility

The provider-specific `createErpHttpAdapters` export and historical `ERP_INTEGRATION_*` transport constants remain aliases for Phase-0 compatibility. Core composition does not depend on those aliases.
