# P0-V3 Acceptance

P0-V3 passes when all of the following are true:

1. P0-V1 and P0-V2 tests continue to pass.
2. A verified request context requires user, tenant, organization and session identity.
3. A fabricated plain JavaScript object cannot masquerade as verified context.
4. Missing integration ports fail closed at boundary construction.
5. Authentication accepts identity only from the configured identity gateway.
6. User search cannot override the verified tenant/organization.
7. ERP lookup cannot override the verified actor/scope.
8. ERP action requests bind actor/scope to verified identity and remain requests to ERP.
9. Push work is routed through an AkshaConnect-owned notification port.
10. New boundary code has no direct imports/references to ERP Access Management, CHUB or Application Management push implementations.
11. `npm run verify` reports zero failures.
