# Procurement System: Frontend (`pms-frontend`)

The React frontend for the Procurement Management System API
([utkarshk014/procurement-system-be](https://github.com/utkarshk014/procurement-system-be)).
Phase 1 covers login and the two-step setup wizard: **financial year**, then **company details**.
Phase 2 adds the masters after setup: **financial years**, **tax and contact details**, **trusts**, and
Form 5: **places, branches, regions** and **institutions**.

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
| ├ step 1 | Financial year: the options from `/financial-years/options` as cards (previous and current; a future year only if the API's `FY_FUTURE_YEARS` allows it). Years that already exist are disabled. Saves `{ finyr }` |
| └ step 2 | Company form. Loads `GET /company` (404 means an empty form), the state list from `/meta/indian-states` and the years from `/financial-years`. Saves the whole form with `PUT /company` |
| `/` | Home: links to the masters, the company summary and the list of financial years. Redirects to `/setup` until setup is done |
| `/company` | Edit company: the same form, which updates the single record. The financial year is a dropdown with the current year selected |
| `/company/tax-details` | PAN, GSTIN (each with "enabled" and a date), GST state, communication email and password, mobile, WhatsApp. Nothing is mandatory; anything typed is checked (PAN format, GSTIN check digit and state code, PAN inside GSTIN). The password is write-only: the page shows "Password saved" and sends `comm_mail_pwd` only when changed (`""` removes it) |
| `/financial-years` | All years, add one from `/financial-years/options`, and **Make current** (`PUT /financial-years/current`) |
| `/trusts` | List, add and edit trusts. The 3-letter code is fixed once created. The start date must fall inside the chosen year |
| `/masters` | Places, branches and regions, one tab each (`?tab=branches`): a searchable list and an add form (3-letter code, name unique ignoring case). No edit yet: the database has no procedure for it |
| `/institutions` | Institutions, 50 a page, filtered by trust, branch and place and searched by name or code (filters stay in the URL) |
| `/institutions/new` | New institution, after the old system's screen: pick the trust and region to get the next ACM code (`SAT-001`) and reg code (`MYS-01`), the 14-character full code is shown; name, place, branch, start year (current or previous), address, and the head, accountant and liaison officer |
| `/institutions/:code` | One institution, laid out like the old "Institution Details" card. Read-only: no edit procedure yet |

The pages after setup (`/company`, `/company/tax-details`, `/financial-years`, `/trusts`, `/masters`, `/institutions`) send the user to
`/setup` until setup is done. If the API can't be reached when the app loads, it shows "Can't reach the
server" with Retry instead of the login page; only a dead session logs out.

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
  website, state list, lengths, PAN, GSTIN (with the GSTN check digit) and trust codes. The API's answer always wins. Its field errors appear under each input.
- Every screen explains the Render cold start when a request takes more than 4 seconds.

## Deploy (Render)

The app is the `pms-web` static site in the backend repo's `render.yaml`
(<https://pms-web-sh9r.onrender.com>). Every merge to `main` builds it with `npm ci && npm run build` and
publishes `dist/`. `VITE_API_URL` is set there; a rewrite sends every path to `index.html`, so deep links
such as `/trusts` work after a refresh.
