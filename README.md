# Project Name (TBD)

HackTX 2026 project. Name and idea are decided separately; this is the skeleton.

**Live:** client https://hack-tx-26.vercel.app · API https://hacktx-26.onrender.com/api/health

**Stack:** React (Vite) + Tailwind + shadcn/ui · Express · Supabase (Postgres, auth, storage) · Meta Muse Spark (Meta Model API)

```
/client       React frontend          (owner: Dev B)
/server       Express backend         (owner: Dev A)
/server/ai    Meta Muse integration   (owner: Dev C)
/supabase     SQL schema + seed files
API.md        API contract
DEPLOY.md     Deploy steps (Vercel + Render + Supabase)
```

## Run locally

Requires Node 20+.

```bash
git clone https://github.com/nav21/HackTX-26.git
cd HackTX-26
npm run setup          # installs root, server and client deps
cp server/.env.example server/.env
cp client/.env.example client/.env
# fill in both .env files (see below)
npm run dev            # server on :3001, client on :5173
```

Open http://localhost:5173. The badge on `/app` should say the API and DB are ok.

Other scripts: `npm run dev:server`, `npm run dev:client`, `npm run build` (client), and in `/server`: `npm run ai:test` (lists Muse models + one sample call; spends a few credits).

## Backend dev

From `/server`:

```bash
npm run db:migrate                 # apply supabase/schema.sql to DATABASE_URL (one transaction, idempotent) + print RLS/publication summary
npm run db:migrate -- --check      # summary only
npm run create-device -- --name "Demo Box"   # new unclaimed device; prints DEVICE_ID / DEVICE_SECRET / pairing code for bridge/.env
npm run device:rotate-secret -- --name "Grandma's pillbox" --owner you@example.com   # (or --device <id>) new secret for an existing device
npm run verify-chain -- <deviceId> # latest events + hash-chain check (service role)
npm test                           # unit tests (hash chain, zod, engine/logic, AI features); no DB or network
npm run test:integration           # drives Care/Habit/Security against the live DB with temp devices, then deletes them
npm run test:routes                # HTTP-level test of the user routes (auth stubbed to an existing profile), cleans up
```

- The device secret is shown once; only its hash is stored. Print the pairing code on the box label.
- Rules engine lives in `server/engine/` (interfaces documented at the top of `engine/index.js`; decisions in `engine/logic/`, see its README). The scheduler ticks every 15 s; every server on the same DB competes for a lease (`scheduler_lease`), so only one ticks at a time. Set `DISABLE_SCHEDULER=true` to opt a server out.
- Every API error is `{ error: { code, message, details? } }` (see API.md).

## Environment variables

Never commit `.env`. Only `.env.example` (key names only) is in git.

### `server/.env`

| Key | Where to find it |
| --- | --- |
| `PORT` | Leave empty for 3001 |
| `CLIENT_URL` | `http://localhost:5173` locally; the Vercel URL in prod (comma-separate multiple) |
| `SUPABASE_URL` | Supabase Dashboard → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page → `service_role` key (or the **secret** key on the new API keys tab). **Server only. Bypasses RLS.** |
| `MODEL_API_KEY` | dev.meta.ai → API keys |
| `MUSE_MODEL` | `muse-spark-1.3` (default) |
| `DATABASE_URL` | Supabase → Connect → **Session pooler** URI (with the DB password). Only needed for `npm run db:migrate`. |
| `DEMO_MODE` | `true` enables `POST /api/demo/schedule-now/:deviceId` (moves the next dose to ~1 min from now) |
| `DISABLE_SCHEDULER` | `true` to stop the 15 s rules-engine tick (e.g. when several dev servers share one DB) |
| `MOCK_AI` | `true` to return canned responses from `server/ai/mocks/` with no API calls. Use this while building UI. |

### `client/.env`

| Key | Where to find it |
| --- | --- |
| `VITE_API_URL` | `http://localhost:3001` locally; the Render URL in prod |
| `VITE_SUPABASE_URL` | Same as `SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → `anon` / **publishable** key (public, safe in the browser) |

Anything prefixed `VITE_` ships to the browser. Never put the service role key or the Meta key in `/client`.

## Supabase setup (once per project)

1. Create a project at supabase.com.
2. `npm --prefix server run db:migrate` (needs `DATABASE_URL`), or SQL Editor → paste and run `supabase/schema.sql`. Then `supabase/seed.sql`.
3. Authentication → Sign In / Providers → **Email**: enabled.
4. Same page → turn **off "Confirm email"** for the hackathon so signup is instant.
5. Authentication → URL Configuration: add `http://localhost:5173` (and the Vercel URL after deploy, see DEPLOY.md).

## Security checklist

Follow this for every table, now and later. The anon key is public, so the database itself must block anything a user shouldn't do.

1. **RLS on every table in `public`, no exceptions.** Every `create table` in `schema.sql` is immediately followed by `alter table ... enable row level security;` and explicit policies.
2. **Policies scoped to the owner.** Use `auth.uid() = user_id` (or a membership check for shared data). Separate select / insert / update / delete policies. Insert and update need `with check`.
3. **No blanket policies.** Never `using (true)` for writes. Only for reads on genuinely public data.
4. **Service role key = server only.** Lives only in `server/.env` and Render env vars. Never in `/client`, never in a `VITE_` variable, never committed.
5. **Server routes still check ownership.** The server uses the service role key, so every route touching user data uses `requireUser` and filters by `req.user.id`.
6. **Storage buckets private by default.** Policies limit access to the owner's folder (path starts with `auth.uid()`). Share with signed URLs, not public buckets.
7. **Views and functions.** Views use `security_invoker = true`. Avoid `security definer`; if needed, set `search_path` and check `auth.uid()` inside.
8. **Don't trust client input.** Never accept `user_id` from the request body; take it from the verified token.
9. **Don't expose secrets in errors.** The error handler returns generic messages in production.
10. **Verify before demo.** Run Supabase Security Advisor (Dashboard → Advisors) and fix every warning. Log in as user A and try to read user B's rows with the anon key; it must return nothing.

## Team workflow

- Branches: `feat/<a|b|c>-<task>`, `fix/<a|b|c>-<task>`; merge within 1–3 hours.
- `git pull --rebase origin main` before starting and before each PR.
- PRs reviewed + merged by Dev A. `main` auto-deploys and must always be demo-able.
- API changes: update `API.md` + post in team chat. Adding fields is safe; renaming/removing needs a heads-up.
- Schema changes: add to `supabase/schema.sql` with RLS + policies in the same change, then post in team chat.
- Use `MOCK_AI=true` while building UI; check Meta credit usage around H12.
- Tags: `v0.1-mvp` at H12, `v1.0-demo` at H18 (feature freeze). Run Security Advisor before H18.
