# PostMitra: in-app scheme applications + admin dashboard

Applicants send a scheme application request from inside PostMitra. Post office / CSP staff receive it in an
admin dashboard, reply, ask for documents, and confirm a visit date. The applicant sees every update in the app.
No other website is involved.

```
Applicant (phone)  --apply-->  API  --appears in-->  Admin dashboard
        ^                       |                          |
        +-- status, messages, visit date  <----------------+
```

## Run it

Needs Node 20+. The server has **zero npm dependencies**.

```bash
ADMIN_PASSWORD='choose-a-strong-one' TOKEN_SECRET="$(openssl rand -hex 32)" node server/index.js
# open http://localhost:4000            -> applicant app  (#/apply, #/track)
# open http://localhost:4000/#/admin    -> staff dashboard
```

| Env var | Purpose |
|---|---|
| `ADMIN_PASSWORD` | Staff password. **Set it.** Falls back to `admin123` with a warning. |
| `TOKEN_SECRET` | Signs admin sessions (8 h). Set a fixed value or staff are logged out on restart. |
| `PORT` | Default 4000 |
| `DATA_FILE` | JSON database path, default `data/db.json` |
| `CORS_ORIGIN` | Only if the UI is hosted on a different origin than the API |
| `TRUST_PROXY=1` | Set when behind a proxy so rate limiting sees real client IPs |

Rebuild the UI after editing `client/src`: `node scripts/build-client.cjs` (needs `react`, `react-dom`, `esbuild`).
Tests: `npm test` (76 API checks on the file store and on the Supabase store), `npm run test:e2e` (37 browser checks, needs Playwright).

## What's included

**Applicant** (English / Hindi / Telugu): sign-in with mobile number + 4-digit PIN (create account on first visit),
application form with validation and a documents-ready checklist, consent tickbox, application number,
"My applications" list with unread dots, status timeline, two-way messages, visit date card, cancel, change PIN.
Every application belongs to the account that created it; nobody else can open it.

**Admin**: password login, stat tiles (click to filter), search by name/phone/ID/village, scheme filter,
unread filter, pagination, detail panel with all applicant data, status + note, visit date/time/post office,
reply with quick-reply templates, private internal notes, **reset a forgotten applicant PIN**, history, CSV export, delete (erasure on request).
Both sides refresh automatically (10 to 15 s polling).

**Status flow**: `submitted` -> `in_review` -> `docs_needed` / `appointment_confirmed` -> `completed` or `rejected`
(applicant can `cancel` until it is closed). `docs_needed` and `rejected` require a note so the applicant is
never left guessing.

## API

Applicant (header `Authorization: Bearer <token>` from register/login, valid 30 days):

| | |
|---|---|
| `GET /api/schemes` | scheme list, document list (public) |
| `POST /api/auth/register` | `{ name, phone, pin }` -> `{ token, user }` |
| `POST /api/auth/login` | `{ phone, pin }` -> `{ token, user }` |
| `GET /api/auth/me` | current account |
| `POST /api/auth/change-pin` | `{ oldPin, newPin }` -> fresh token (other devices signed out) |
| `POST /api/applications` | create (contact number is taken from the account) |
| `GET /api/applications` | my applications |
| `GET /api/applications/:id` | one of mine (anyone else's returns 404) |
| `POST /api/applications/:id/messages` | `{ text }` |
| `POST /api/applications/:id/cancel` | |

Admin (header `Authorization: Bearer <token>` from `POST /api/admin/login`):
`GET /api/admin/applications`, `GET|PATCH|DELETE /api/admin/applications/:id`,
`POST .../:id/messages`, `POST .../:id/notes`, `POST .../:id/reset-pin`, `GET /api/admin/export.csv`.

## Add it to your existing PostMitra React app

1. Copy `client/src/{Apply,Track,Admin}.jsx`, `ui.jsx`, `api.js`, `i18n.js`, `styles.css` into your app (e.g. `src/apply/`).
2. Wrap with `LangProvider` (pass `initial={yourCurrentLang}` to follow your app's language) and add routes:

```jsx
import { LangProvider, ApplyPage, TrackPage, AdminPage } from './apply';
<Route path="/apply"  element={<LangProvider><ApplyPage presetScheme={schemeId} onTrack={(id)=>navigate(`/track/${id}`)} /></LangProvider>} />
<Route path="/track/:id?" element={<LangProvider><TrackPage initialId={params.id} /></LangProvider>} />
<Route path="/admin"  element={<AdminPage />} />
```

3. Put an **"Apply in PostMitra"** button on each scheme card that opens `/apply` with `presetScheme` set.
4. Set the API address if the backend is on another origin: `window.POSTMITRA_API = 'https://your-api'`.
5. Edit `server/schemes.js` so scheme ids/names match your 13 schemes.

## Deploying

See **DEPLOY.md** for the Vercel + Supabase steps. Locally the server uses a JSON file; on Vercel it uses Supabase
(set `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ADMIN_PASSWORD`). Schema: `supabase/schema.sql`.

## Privacy and safety (DPDP Act 2023)

- Collects only what staff need; explicit consent is required; Aadhaar numbers are **never** collected, only a
  checklist that the person has the document.
- PINs are stored as salted scrypt hashes, never in plain text. Easy PINs (1234, 1111, 4321...) are refused.
  5 wrong PINs lock the account for 15 minutes; sign-up and sign-in are also rate limited per IP.
- Sessions are signed and expire (applicants 30 days, staff 8 hours). Changing or resetting a PIN signs out every older session.
- The applicant API never exposes internal notes or other people's data. An application that is not yours looks like "not found".
- Forgotten PIN: staff confirm the person's identity, press **Reset applicant's PIN** in the dashboard and read out the
  temporary PIN. The applicant must choose a new PIN at next sign-in.
- CSV export neutralises spreadsheet formula injection. Admin delete erases an applicant's data on request.
- This is a **request and appointment** system. Staff still complete KYC and account opening in person.

## Known limits

- A 4-digit PIN is convenient for first-time users but weaker than an SMS code. The lockout limits guessing. For stronger
  security add SMS OTP later with a provider such as MSG91 or Twilio.
- Updates poll every 10 to 15 s (no push). Add SMS/WhatsApp notifications later with a provider such as Twilio/MSG91.
- One shared admin password. For several staff, add per-user accounts.
- The JSON file store suits a college demo or one server, not heavy load.
