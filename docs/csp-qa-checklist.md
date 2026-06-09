# CSP QA Checklist

Use this checklist after any change to `vercel.json`, Firebase SDK usage, auth providers, exports, or external assets.

## Runtime Checks

- App loads from the deployed Vercel URL with no blank screen.
- Browser console has no `Content Security Policy` violation.
- Network tab has no blocked Firebase, Google, Vite asset, chunk, font, image, or export-related request.
- Vite JS chunks and CSS assets load from `self`.
- Dynamic imports keep working after a hard refresh.

## Firebase Auth

- Admin login succeeds.
- Admin logout succeeds.
- Password reset flow still opens/sends correctly.
- No Firebase Auth requests are blocked.
- If a future Google OAuth provider is added, re-check `frame-src` and `connect-src`.

## Firestore

- Employees, shifts, templates, announcements, settings, and week history load.
- Realtime subscriptions update after a write.
- Schedule generation writes generated shifts.
- Manual shift create/update/delete works.
- Clear day/week/month works.
- Week finalization works.
- Audit log creation is not blocked.

## Scheduler And Exports

- Weekly schedule renders.
- Monthly stacked weeks render.
- Schedule generation still respects current scheduler QA.
- PDF/Excel/Word export controls still work.
- Browser-generated downloads are not blocked.

## Expected Temporary Trade-Off

- `style-src 'unsafe-inline'` is currently allowed for compatibility with React inline styles and dynamic UI styles.
- Do not add `script-src 'unsafe-inline'` unless there is a documented, verified production breakage.
- Tighten CSP only after browser verification on deployed Vercel output.
