# P1-V4 Acceptance

Base commit: `2a51eb866d56d1fda68677268e4c8ee0ee8560f5`

## Install and automated gate

P1-V4 adds the first React/Vite dependencies. From the repository root run:

```text
npm install
npm run verify
```

`npm install` is expected to update the root `package-lock.json` because `apps/*` becomes a root workspace.

The verify command must keep all historical tests green, run P1-V4 static architecture tests, and finish with a successful Vite production build.

Expected test count before any later checkpoints:

```text
tests 88
pass  88
fail  0
```

## Start the applications

API terminal:

```text
AKSHACONNECT_IDENTITY_PROVIDER=LOCAL
AKSHACONNECT_BUSINESS_PROVIDER=NONE
AKSHACONNECT_DATABASE_EXPECTED_NAME=akshaconnect
AKSHACONNECT_DATABASE_URL=<local standalone database URL>
npm run start:api
```

Web terminal:

```text
npm run start:web
```

Open `http://127.0.0.1:4173`.

## Practical browser gate

Use the P1-V2 DEV credentials.

1. Alice signs into `DEV_ALPHA`.
2. The workspace shell shows Alice, workspace name, channels, and existing Alice/Bob DM.
3. Refresh the browser and confirm the valid session is restored without entering the password again.
4. Create a uniquely named PUBLIC channel from the UI and confirm it immediately appears in the sidebar.
5. Open the new direct-message picker and confirm only DEV_ALPHA members are offered; DEV_BETA Carol must not appear.
6. Start/open the Bob DM and confirm the selected conversation uses the existing canonical DM.
7. Confirm the composer is visible but disabled and states that messaging activates in P1-V5.
8. Open a second browser/private session and sign in as Bob to confirm the same shared channel/DM navigation.
9. Sign out both sessions.

## Scope guard

P1-V4 adds no migration and no message-send/history API. Do not create message persistence in the browser.
