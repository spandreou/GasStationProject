# Monthly PDF Archive Runbook

This runbook covers the controlled rollout, verification, and rollback of the
admin-only monthly PDF archive for BP Kallis.

## Scope

The monthly PDF archive stores generated monthly schedule PDFs in private
Firebase Storage and keeps admin-only metadata in Firestore.

The archive is not public. Public/read-only users must not be able to list,
read, download, upload, or overwrite archive files.

## Storage Bucket Requirements

Use the configured Firebase Storage bucket exactly:

```text
gasstationproject-9dd89.firebasestorage.app
```

Do not normalize, rewrite, or convert the `firebasestorage.app` bucket to
`appspot.com`.

Firebase Storage must be initialized explicitly with the configured bucket,
not with the fallback/default bucket. The app should preserve the configured
bucket and initialize Storage with that bucket, for example:

```js
getStorage(app, `gs://${firebaseEnv.storageBucket}`)
```

The first controlled rollout failed because the upload targeted the legacy
`appspot.com` bucket after bucket normalization. The fix is to keep
`firebasestorage.app` unchanged and pass the configured bucket explicitly to
Firebase Storage initialization.

## Feature Flag

The monthly PDF archive is controlled by:

```text
VITE_ENABLE_MONTHLY_PDF_ARCHIVE
```

Default value:

```text
false
```

Enable it only after Firestore rules, Storage rules, build, QA, and security
checks pass.

## Private Data Locations

Storage object path:

```text
tenants/{tenantId}/monthly_schedule_pdfs/{YYYY-MM}/program_month_{YYYY-MM}.pdf
```

Firestore metadata document:

```text
monthly_schedule_exports/{tenantId}_{YYYY-MM}
```

Expected metadata is limited to safe admin fields such as tenant id, month,
file name, storage path, status, shift count, and timestamps. The metadata is
admin-only and must not be exposed to public/read-only users.

## Safe Enable Sequence

1. Deploy Firestore and Storage rules:

```bash
npm run deploy:firebase-rules -- --project gasstationproject-9dd89
```

2. Verify unauthenticated Firebase Storage access returns `403` for archive
   list/read attempts.

3. Keep the feature disabled until the checks above pass.

4. Set `VITE_ENABLE_MONTHLY_PDF_ARCHIVE=true` only in the intended deployment
   environment. Do not print the deployment environment file or secrets.

5. Rebuild and restart the Docker deployment:

```bash
docker compose up -d --build
```

6. Verify the app is reachable:

```bash
curl -I --max-time 10 http://localhost:8085/
curl -I --max-time 15 https://bp-kallis.homelabshare.gr/
```

7. Log in as admin and generate the monthly schedule/archive.

8. Verify the private Storage object exists under:

```text
tenants/{tenantId}/monthly_schedule_pdfs/{YYYY-MM}/program_month_{YYYY-MM}.pdf
```

9. Verify Firestore metadata exists in:

```text
monthly_schedule_exports/{tenantId}_{YYYY-MM}
```

10. Verify `audit_logs` contains safe audit entries for archive generate and
    archive download.

11. Download the archived PDF as admin and confirm the file downloads.

12. Log out and verify public/read-only mode:

- Archive UI is not visible.
- Archive metadata is not visible.
- Direct unauthenticated Storage list/read attempts still return `403`.
- Public/read-only users cannot download archive files.

## Rollback

If any rollout check fails:

1. Set the deployment flag back to:

```text
VITE_ENABLE_MONTHLY_PDF_ARCHIVE=false
```

2. Rebuild and restart Docker:

```bash
docker compose up -d --build
```

3. Verify the live app still responds:

```bash
curl -I --max-time 10 http://localhost:8085/
curl -I --max-time 15 https://bp-kallis.homelabshare.gr/
```

4. Confirm the public/read-only UI does not show archive controls.

## Audit Logging Rules

Never log or store any of the following in `audit_logs`:

- signed URLs
- public URLs
- full download URLs
- file contents
- blobs
- base64
- tokens
- secrets
- `.env` values
- private keys

Safe audit fields include tenant id, year/month, file name, record count or
shift count, action type, and status. Avoid storing private Storage paths in
audit logs.

## Validation Commands

Run the relevant checks before enabling the feature and after any archive code
change:

```bash
npm run build
npm run qa:scheduler
npm run qa:scheduler-engine
npm run qa:repositories
npm run qa:saas-foundation
npm run qa:export-security
npm run security:scan
```

For docs-only changes, run at least the export security check and a build when
practical.

## CORS Note

Authenticated browser upload/download may require Firebase Storage CORS for
the BP Kallis origin. CORS configuration does not make archive files public;
rules must still require admin access for read and write.

Do not solve CORS by creating public files, public URLs, signed URLs, or wider
Storage rules.
