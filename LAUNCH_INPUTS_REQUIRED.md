# Inputs Required From You Before Processing

Please provide these before we execute final deployment:

## Required

1. Hosting platform:
   - Vercel / Netlify / GitHub Pages
2. Repository URL:
   - paste the GitHub repository link
3. Access level:
   - Public link
   - or Private link-only (recommended)
4. Launch date and time
5. Final admin email

## Recommended

1. Recipient email list for access control
2. Who approves final go-live
3. Who owns rollback decision

## Decision checkpoint

- If you need shared data across users, request backend+database first.
- If this is demo/pilot only, static localStorage mode is acceptable.

## Required for Netlify shared registrations and email verification

1. Netlify environment variables:
   - `RESEND_API_KEY`
   - `EMAIL_FROM` (example: `ACC Team <no-reply@yourdomain.com>`)
   - `GOOGLE_SHEETS_ID`
   - `GOOGLE_SHEETS_RANGE` (example: `Leaderboard!A:C`)
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `GOOGLE_PRIVATE_KEY` (preserve line breaks with `\\n`)
2. Email provider account:
   - Resend account with verified sender domain
3. Netlify Functions enabled:
   - This project uses `netlify/functions/*` and Netlify Blobs for shared app state storage.
   - Shared data (users, organizations, inquiries, referral directory) is persisted server-side.
   - Google Sheet sync functions are also hosted in `netlify/functions/*`.
   - Login session uses browser session storage only for the active user id.

## One-time deploy prep after pulling latest code

1. Run `npm install`
2. Deploy to Netlify
3. Add `RESEND_API_KEY` and `EMAIL_FROM` in Netlify Project Settings > Environment Variables
4. Add `GOOGLE_SHEETS_ID`, `GOOGLE_SHEETS_RANGE`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, and `GOOGLE_PRIVATE_KEY` in Netlify Project Settings > Environment Variables
