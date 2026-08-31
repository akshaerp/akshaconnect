# P0-V2 Acceptance

Run from repository root:

```bash
npm ci
npm run verify
```

Expected additions beyond V1:

- extraction map JSON parses and contains only approved dispositions
- every inventory source path is unique
- source AkshaERP SHA is pinned to `21f72ba86bb1cb2e09012285a7b01d71a45280e0`
- AkshaERP CHUB/Access Management implementations are not classified as `MOVE`
- ERP record lookup remains `KEEP_IN_ERP`
- UserDirectory database implementation remains `KEEP_IN_ERP`
- `AcnErpEventCard` is `ADAPT`, not blindly moved
- SystemSender bridge is `TRANSITIONAL`
- cross-process realtime relay is `TRANSITIONAL`
- ERP `server.js` remains `KEEP_IN_ERP`

## P0-V2 pass gate

1. `npm run verify` passes.
2. V1 behavior/tests remain green.
3. File-level extraction map is reviewed against the pinned ERP SHA.
4. No production ERP source is copied into standalone in this checkpoint.
5. Identity/authorization remains ERP-authoritative.
6. Collaboration ownership is clearly separated from ERP lookup/CHUB/workflow ownership.
