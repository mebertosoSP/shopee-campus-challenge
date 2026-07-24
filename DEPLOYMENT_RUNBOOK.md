# Deployment Runbook (Manual, Safe)

This runbook is designed to avoid accidental go-live.
No auto-deploy setup is included.

## A. Prepare repository (safe)

1. Create a GitHub repository
2. Push this folder to that repository
3. Keep repository private until launch decision

Example commands:

```powershell
git init
git add .
git commit -m "Pre-live build"
git branch -M main
git remote add origin <YOUR_REPO_URL>
git push -u origin main
```

## B. Choose host (do not deploy yet)

Pick one:

- Vercel (easy)
- Netlify (easy)
- GitHub Pages (simple static)

Connect repository to host account but do NOT click final Deploy/Publish yet.

## C. Launch requirements from you

- Platform login access
- Repository ownership access
- Decision on private access model
- Final sign-off from manager

## D. Private link-only recommendation

Best option:

1. Put site behind Cloudflare Zero Trust Access
2. Restrict to approved email addresses
3. Share URL only by email

Without access control, anyone with the link can still open it.

## E. Day-of-launch steps

1. Confirm placeholder orgs removed
2. Confirm test data removed
3. Set Netlify environment variables: `RESEND_API_KEY`, `EMAIL_FROM`
4. Set Google Sheets environment variables: `GOOGLE_SHEETS_ID`, `GOOGLE_SHEETS_RANGE`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`
5. Run `npm install` to include Netlify Functions dependency
6. Take backup snapshot (zip project + git tag)
7. Deploy once
8. Smoke test pages after deploy:
	- Registration appears in admin on a second browser/device
	- Email verification code is received and accepted
	- Admin edits (approve/decline/referral code changes) appear on another browser after refresh
	- Logging in/out on one browser does not sign out another browser session
	- Admin Google Sheet live window loads rows and shows matched organization names
	- Clicking "Sync sheet to leaderboard" updates leaderboard tallies
9. Send email with approved URL

## F. Rollback plan

If issue is found after launch:

1. Revert to previous commit
2. Redeploy previous commit
3. Notify recipients of restoration
