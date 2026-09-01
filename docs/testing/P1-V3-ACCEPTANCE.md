# P1-V3 Acceptance

Base commit: `72675b838b9953d627746f9dc39801c13496f55c`

## Automated gate

Run:

```text
npm run verify
```

Expected:

- all historical P0/P1-V1/P1-V2 tests remain green
- P1-V3 channel/DM tests pass
- no provider-specific ERP identifiers enter collaboration service/repository contracts

## Database gate

In DBeaver, confirm:

```sql
SELECT current_database();
```

Expected:

```text
akshaconnect
```

Run once:

```text
database/migrations/202609011950__p1_v3_channel_direct_message_api.sql
```

Then run:

```text
database/verification/verify_p1_v3_channel_direct_message_api.sql
```

Expected key gates:

```text
p1_v3_direct_message_table_gate = PASS
p1_v3_unique_dm_pair_gate       = PASS
p1_v3_dm_type_fk_gate           = PASS
p1_v3_channel_code_ci_gate      = PASS
```

## Live API gate

Run in pure standalone mode:

```text
AKSHACONNECT_IDENTITY_PROVIDER=LOCAL
AKSHACONNECT_BUSINESS_PROVIDER=NONE
```

Using the P1-V2 DEV identities:

1. Alice logs into DEV_ALPHA.
2. Member discovery returns Alice/Bob but never DEV_BETA Carol.
3. Alice creates a PUBLIC channel.
4. Alice lists channels and sees the new channel.
5. Creating the same channel code with different letter case returns `409 CHANNEL_CODE_EXISTS`.
6. Alice starts a DM with Bob.
7. Starting Alice↔Bob again returns the same conversation with `created=false`.
8. Alice lists DMs and sees Bob.
9. Bob logs in and lists DMs and sees the same conversation with Alice.
10. Alice attempts to start a DM using Carol's DEV_BETA member ID and receives `DIRECT_MESSAGE_TARGET_INVALID`.

## Scope boundary

P1-V3 does not accept message bodies and does not create `ac_message` rows. Message send/history/read-cursor behavior remains P1-V5.
