# Procurement System: Frontend (`pms-frontend`)

The React frontend for the Procurement Management System API
([utkarshk014/procurement-system-be](https://github.com/utkarshk014/procurement-system-be)).
Phase 1 covers login and the two-step setup wizard: **financial year**, then **company details**.

| | |
|---|---|
| Stack | Vite 5, React 18, TypeScript, React Router 6; plain CSS, no UI library |
| API | `VITE_API_URL` (dev: `https://pms-api-bcv8.onrender.com`) |
| Dev URL | `http://localhost:3000` (the only local origin the API allows) |

## Run locally

```bash
cp .env.example .env.local
npm install
npm run dev          # http://localhost:3000; use localhost, not 127.0.0.1
```

`npm run build` type-checks and builds to `dist/`.

## Screens

| Route | Screen |
|---|---|
| `/login` | Email and password. 401: "Email or password is incorrect". 403: disabled. 429: wait a minute |
| `/setup` | Wizard. Asks `GET /setup/status` and shows the `next_step` |
| ├ step 1 | Financial year: the two options from `/financial-years/options` as cards. Years that already exist are disabled. Saves `{ finyr }` |
| └ step 2 | Company form. Loads `GET /company` (404 means an empty form) and the state list from `/meta/indian-states`. Saves the whole form with `PUT /company` |
| `/` | Home: the company summary and the list of financial years. Redirects to `/setup` until setup is done |
| `/company` | Edit company: the same form, which updates the single record |

There is **no company number** in the form. The API keeps one company per organisation (`sl = 1`) and
always uses the logged-in user's organisation. The frontend never sends `sl`, `time_zone`,
`rec_created_at` or a tenant ID.

## How it works

- `src/lib/api.ts` is the handoff's fetch helper. It adds the bearer token, refreshes once on a 401
  (one refresh shared by every waiting call), unwraps `data` and throws `ApiError` with `fields[]`.
  The access token lives in memory and the refresh token in `localStorage`.
  - One change from the handoff version: `/auth/me` also triggers a refresh, so a page reload keeps
    you logged in. Only login, refresh and logout are excluded.
- `src/lib/validators.ts` mirrors the API rules for instant feedback: PIN, Indian mobile, email,
  website, state list and lengths. The API's answer always wins. Its field errors appear under each input.
- Every screen explains the Render cold start when a request takes more than 4 seconds.

## Deploy (Vercel)

1. Import this repo. Vercel detects Vite, so the build is `npm run build` and the output is `dist`.
2. Add `VITE_API_URL=https://pms-api-bcv8.onrender.com` for Production and Preview, then redeploy.
3. Send Utkarsh the production URL so he can add it to the API's `CORS_ALLOWED_ORIGINS`.

`vercel.json` rewrites every path to `index.html`, so deep links such as `/company` work.
