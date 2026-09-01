# P0-V5 Provider-Neutral Standalone Architecture

> **P0-V6D clarification:** the P0-V5 product rule remains unchanged, but the core port name `erpGateway` used at that checkpoint has been superseded by provider-neutral `businessGateway`. AkshaERP-specific transport remains only inside the AkshaERP adapter.

**Checkpoint:** P0-V5  
**Standalone base:** `2b2f3de5bba846cb5e82ac08b11c1af9380f41b1`

P0-V5 makes a permanent product rule explicit: **AkshaConnect core must be usable without AkshaERP.** AkshaERP is the deepest native integration, not a mandatory runtime dependency.

## Provider modes

Identity provider:

- `LOCAL` — AkshaConnect-owned users/sessions. This is the pure standalone path.
- `AKSHAERP` — identities and organization context are verified by AkshaERP.

Business provider:

- `NONE` — collaboration-only product; business-provider features are unavailable but chat remains valid.
- `AKSHAERP` — business record/action capabilities are supplied through the native AkshaERP connector.

Initial configuration:

```text
AKSHACONNECT_IDENTITY_PROVIDER=LOCAL
AKSHACONNECT_BUSINESS_PROVIDER=NONE
```

This is the intended standalone product mode.

## Core rule

The collaboration core depends on ports, not on AkshaERP modules:

```text
AkshaConnect core
  -> identityGateway
  -> businessGateway (capability may be unavailable)
  -> notificationPort
```

`LOCAL/NONE` must never instantiate the AkshaERP HTTP adapter and must never require ERP URL, secret or network access.

## Local identity security gate

P0-V5 deliberately does not invent an insecure username/password store. `LOCAL` mode requires an AkshaConnect-owned identity provider implementing the existing identity port. The durable local user/session implementation will be built with the standalone persistence baseline in the next implementation phase.

A missing local identity provider fails at composition time with `LOCAL_IDENTITY_PROVIDER_REQUIRED`.

## No-business behavior

With `AKSHACONNECT_BUSINESS_PROVIDER=NONE`, normal collaboration remains valid. Business-only operations fail explicitly with `BUSINESS_FEATURE_UNAVAILABLE`; there is no hidden fallback to AkshaERP or direct ERP database access.

## AkshaERP remains native, not mandatory

When configured as `AKSHAERP`, the provider-specific transport remains available behind the generic business port. The AkshaERP Integration Gateway receiver and credential model are isolated from the collaboration core.

## Future providers

The provider boundary allows later adapters such as OIDC/Azure/Google identity and SAP/Oracle/Dynamics/custom business connectors without changing collaboration ownership. Those providers are roadmap possibilities, not implemented in P0-V5/P0-V6D.

## Compatibility

Deployments that have neither new provider variable retain P0-V4's legacy `AKSHACONNECT_ERP_INTEGRATION_ENABLED` behavior. New deployments should use the explicit provider variables.
