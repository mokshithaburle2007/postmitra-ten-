# Deploy PostMitra to Vercel (about 15 minutes, all free tier)

You need three free accounts: **GitHub** (you have it), **Supabase** (database) and **Vercel** (hosting).
Never paste passwords or keys into chat or commit them to GitHub. They go only into Vercel's settings.

## 1. Create the database (Supabase)

1. Go to supabase.com, sign in, **New project**. Name it `postmitra`, pick a region near you (e.g. Mumbai), set a database password, and wait about 2 minutes.
2. Open **SQL Editor -> New query**, paste the whole of `supabase/schema.sql`, click **Run**. You should see "Success".
If you ran an older `schema.sql` before, run this one again: it is safe to repeat and only adds the new `users` table.
3. Open **Project Settings -> API** and keep this tab open. You will copy two values:
   - **Project URL** (looks like `https://abcd1234.supabase.co`)
   - **service_role key** (under "Project API keys", click Reveal). This one is secret. Do **not** use the `anon` key.

## 2. Put the code on GitHub

1. Unzip `postmitra-vercel.zip`. Open the `postmitra` folder inside it.
2. In your repo on github.com click **Add file -> Upload files**.
3. Select **everything inside the folder** (not the folder itself) and drag it in, so that `vercel.json`, `api/`, `public/`, `server/` and `supabase/` sit at the top level of the repo. Click **Commit changes**.

If the repo already contains your older PostMitra app, create a new empty repo for this instead, or upload to a new branch, so nothing gets overwritten.

## 3. Deploy on Vercel

1. vercel.com -> **Add New -> Project** -> import your GitHub repo.
2. **Project Name:** `postmitra` (if taken, try `postmitra-apply` or `postmitra-vizag`). The link will be `https://<name>.vercel.app`.
3. **Framework Preset:** Other. Leave Build and Output settings alone (`vercel.json` already sets them).
4. Open **Environment Variables** and add:

| Name | Value |
|---|---|
| `SUPABASE_URL` | the Project URL from step 1 |
| `SUPABASE_SERVICE_KEY` | the service_role key from step 1 |
| `ADMIN_PASSWORD` | a strong staff password you choose |
| `TOKEN_SECRET` | optional: any long random string |

5. Click **Deploy**. When it finishes, open the link.

## 4. Check it works

- Open `https://<name>.vercel.app` -> **Create account** (name, mobile, 4-digit PIN) -> fill the form -> you get a number like `PM-2026-0001`.
- Open `https://<name>.vercel.app/#/admin`, sign in with `ADMIN_PASSWORD`, and you should see the request.
- Reply from the dashboard, then open **Track status** on the applicant side: the reply shows up within about 10 seconds.

## Troubleshooting

- **"not_configured" / the app loads but submitting fails:** an environment variable is missing or misspelled. Fix it in **Settings -> Environment Variables**, then **Deployments -> ... -> Redeploy** (changes only apply to new deployments).
- **Supabase error in Vercel logs (401/404):** you used the anon key, or `schema.sql` was not run.
- **404 on `/api/...`:** `api/[...path].js` is not at the repo root. Re-upload keeping the folder structure.
- **Applicant forgot their PIN:** open the application in the staff dashboard -> **Account help** -> **Reset applicant's PIN**. Read the temporary PIN to them (after confirming who they are). They sign in with it and choose a new PIN.
- **Forgot the admin password:** change `ADMIN_PASSWORD` in Vercel and redeploy. Existing admin sessions end.

## Good to know

- Applicant data lives in your Supabase project. To erase a person's data on request use the Delete button in the dashboard.
- The rate limiter counts per server instance, so on Vercel it slows abuse down but is not a hard global limit.
- Two people editing the same application at the exact same instant can overwrite each other's change. This is fine at CSP scale.
- To change scheme names, edit `server/schemes.js` and re-upload that file.
