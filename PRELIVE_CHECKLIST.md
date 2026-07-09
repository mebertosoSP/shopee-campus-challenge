# Pre-Live Checklist (No Publish Yet)

This project is ready for pre-live preparation only.
Do not click any Publish/Deploy button until final approval.

## 1. Items required from you

- Hosting platform choice: Vercel, Netlify, or GitHub Pages
- GitHub account and repository (new or existing)
- Final admin credentials you want to use for launch
- Allowed recipient email list (if using private access)
- Go-live date/time and owner who will press Deploy

## 2. Technical truth you should approve

- This website is static HTML/CSS/JS.
- Current data storage is browser localStorage.
- That means data is per browser/device and not shared globally.

If you need shared admin/org data across all users, backend + database is required before production.

## 3. Pre-launch data cleanup

- Use Admin -> Delete all placeholder orgs
- Remove test accounts
- Remove test inquiries and test weekly referrals
- Confirm only final admin account remains

## 4. Functional QA before publish

- Register organization works
- Login works (org and admin)
- Admin can approve/decline organizations
- Admin can edit/delete weekly referral entries
- Admin can reply to inquiry and mark pending/resolved
- Admin reset password modal works
- User change-password works
- Leaderboard and dashboard values render correctly
- Mobile layout check (small screen)

## 5. Privacy controls (recommended)

- If link-only access is required, add an access gate:
  - Cloudflare Zero Trust Access (recommended)
  - or Netlify password protection (basic)
- Do not post URL publicly
- Use noindex policy if needed

## 6. Final approval gate

- Manager approval documented
- Final walkthrough completed
- Rollback owner assigned
- Only then proceed to deployment steps
