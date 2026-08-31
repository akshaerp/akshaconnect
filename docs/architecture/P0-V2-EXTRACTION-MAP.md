# P0-V2 Extraction Map

Source of truth: `P0-V2-EXTRACTION-MAP.json`.

## Disposition meanings

| Disposition | Meaning |
| --- | --- |
| `MOVE` | Collaboration-owned implementation can move after import/config cleanup. |
| `ADAPT` | Ownership moves to AkshaConnect, but direct copying would retain ERP coupling or wrong process assumptions. |
| `KEEP_IN_ERP` | Implementation belongs to ERP and must be called through a contract/API/event. |
| `SHARED_CONTRACT` | Shape must be versioned and understood by both products; implementation stays on its owning side. |
| `TRANSITIONAL` | Keep temporarily to maintain parity while old and new paths coexist; remove after cutover gate. |
| `DEPRECATE_LATER` | Migration evidence/legacy implementation that should not become standalone runtime code. |

## High-value ownership decisions

### Move/Adapt into AkshaConnect

- Collaboration tables/models and associations.
- Messaging, channels, threads, reactions, saved/pinned state, read state and search behavior.
- Message encryption and retention.
- Presence/status data and realtime delivery.
- Collaboration attachment ownership.
- Most collaboration web UI.

### Keep in AkshaERP

- Canonical users/employees and organization membership authority.
- ERP record lookup/discovery.
- ERP authentication authority.
- CHUB routing/retry/escalation.
- JBM, Reporting, Workflow/approval execution.
- Current Application Management push implementation (until standalone push is built; do not import it cross-repository).

### Transitional only

- Embedded AkshaERP launcher/routes.
- CHUB SystemSender in-process bridge.
- CHUB document-artifact bridge.
- PostgreSQL cross-process realtime relay.

## SystemSender cutover rule

Until CHUB sends versioned events directly to the standalone receiver, the current ERP worker behavior remains authoritative. The SystemSender bridge must wrap the final AkshaConnect send path before the realtime publisher bridge is installed. This invariant is now represented in automated P0-V2 tests and must not be lost during compatibility work.

## No shared-database shortcut

The standalone service may temporarily run against controlled compatibility data during migration, but the target architecture does not permit permanent direct reads of:

- `am_users`
- `am_user_org`
- `hr_employees`
- ERP transaction tables

Those become secured identity/ERP integration calls or verified token claims.

## Extraction sequence

1. Freeze versioned identity/tenant and ERP event contracts.
2. Build standalone persistence baseline from ACN schema history.
3. Port collaboration models/repositories behind standalone database/config/errors.
4. Introduce ERP identity/user-directory SDK boundary and remove `am_*`/HR imports from moved code.
5. Port read-only GraphQL/API paths and compare responses against embedded ERP.
6. Port write paths with idempotency and parity regression tests.
7. Port realtime/presence and replace ERP JWT/table checks with standalone auth contract.
8. Port attachments and protected artifact references.
9. Connect CHUB via versioned SystemSender event delivery; then retire shared-DB relay/monkey-patch bridges.
10. Move web UX and keep ERP launcher as a deep-link until parity/cutover is accepted.
