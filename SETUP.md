# HackTX Setup Instructions (for Claude Code)

Run this at kickoff, inside a fresh, empty repo cloned from our GitHub org.
Goal: a working, deployable full-stack skeleton in under 30 minutes. No product features yet. The idea gets decided separately.

Stack: React (Vite) + Tailwind + shadcn/ui · Express · Supabase (Postgres, auth, storage) · Meta Muse Spark (via Meta Model API)

## Ground rules

- All code must be written during the hacking period. Do not copy code from any other project.
- Use current official docs for install commands (Vite, shadcn/ui, Tailwind, Supabase, Meta Model API at dev.meta.ai/docs). Versions change; don't guess.
- Commit after each step with a clear message (e.g. `chore: scaffold client`). Push to `main` after each commit during setup only; after setup, all work goes through branches + PRs.
- Never commit `.env`. Use `.env.example` with key names only.
- The Supabase service role key and the Meta API key stay server-side only. Never put them in `/client`.
- Use subagents in parallel for Steps 2, 3 and 4 if available. They touch separate folders, so there are no conflicts.
- Stop and tell me if anything needs a login, an API key, or a decision.

## Step 1: Repo structure

Create:

```
/client       React frontend (owner: Dev B)
/server       Express backend (owner: Dev A)
/server/ai    Meta Muse integration (owner: Dev C)
/supabase     SQL schema + seed files
API.md        API contract (empty template, see below)
README.md     Project name placeholder + how to run locally
.gitignore    Node, .env, dist, build, .DS_Store
.env.example  in both /client and /server
```

API.md template:

```
# API Contract
Base URL: (fill after deploy)

## Endpoints
### GET /api/health
returns: { "status": "ok", "db": "ok" | "error" }

<!-- Add each endpoint: method, path, request body, response JSON shape -->
<!-- Adding fields is safe. Renaming/removing fields needs a heads-up in team chat. -->
```

## Step 2: Client (/client)

1. Scaffold with Vite, React template (JavaScript unless I say TypeScript).
2. Install and configure Tailwind + shadcn/ui following shadcn's official Vite guide.
3. Install: `react-router-dom`, `axios`, `framer-motion`, `lucide-react`, `recharts`, `@supabase/supabase-js`.
4. Add shadcn components: button, card, input, dialog, skeleton, sonner, tabs, avatar.
5. Create:
   - `src/lib/api.js`: axios instance using `import.meta.env.VITE_API_URL` (fallback `http://localhost:3001`). Attach the Supabase session access token as `Authorization: Bearer <token>` when logged in.
   - `src/lib/supabase.js`: Supabase client from `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
   - `src/context/AuthContext.jsx`: current user/session, `signIn`, `signUp`, `signOut`, listens to auth state changes
   - Simple email + password login/signup page at `/login`, and a `ProtectedRoute` wrapper
   - `src/theme.css` or Tailwind theme tokens: CSS variables for background, foreground, primary accent, muted, radius. Placeholder dark theme; we'll restyle after ideation.
   - `src/mocks/`: empty folder with a README note: "mock JSON responses matching API.md go here"
   - Routes: `/` (Landing placeholder), `/login`, `/app` (protected Main placeholder)
   - A small status badge on `/app` that calls `GET /api/health` and shows ok / error, with loading and error states
6. `.env.example`: `VITE_API_URL=`, `VITE_SUPABASE_URL=`, `VITE_SUPABASE_ANON_KEY=`
7. Verify `npm run dev` and `npm run build` both succeed.

## Step 3: Server (/server)

1. `npm init -y`, set `"type": "module"`.
2. Install: `express`, `cors`, `dotenv`, `morgan`, `@supabase/supabase-js`. Dev: `nodemon`.
3. Scripts: `"dev": "nodemon index.js"`, `"start": "node index.js"`.
4. Create:
   - `index.js`: Express app, JSON body parsing, CORS (allow `CLIENT_URL` + localhost), morgan logging, `GET /api/health` → `{ status, db }` (db = result of a trivial Supabase query), central error handler returning JSON
   - `supabase.js`: server-side Supabase admin client using `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; server still starts (with a warning) if they're missing
   - `middleware/auth.js`: `requireUser` reads the Bearer token, verifies it with `supabase.auth.getUser(token)`, sets `req.user`, returns 401 otherwise
   - `routes/`: folder with an example router mounted at `/api`, plus one protected example route `GET /api/me` using `requireUser`
5. Listen on `process.env.PORT || 3001`.
6. `.env.example`: `PORT=`, `CLIENT_URL=`, `SUPABASE_URL=`, `SUPABASE_SERVICE_ROLE_KEY=`, `MODEL_API_KEY=`, `MUSE_MODEL=muse-spark-1.3`, `MOCK_AI=`
7. Verify `npm run dev` starts and `/api/health` returns ok.

## Step 4: Database (/supabase)

1. `supabase/schema.sql`: a `profiles` table (`id uuid` references `auth.users`, `display_name`, `avatar_url`, `created_at`) with Row Level Security enabled and policies so users can read/update their own row, plus a trigger that creates a profile on signup.
2. `supabase/seed.sql`: empty stub with a comment ("demo seed data goes here").
3. I'll paste these into the Supabase SQL editor myself. Tell me when they're ready.
4. Note in README: enable Email auth in Supabase and turn off email confirmation for the hackathon so signup is instant.

## Step 4b: Supabase security rules (apply to every table, now and later)

The anon key is public (it ships in the frontend), so the database itself must block anything a user shouldn't do. Most Supabase leaks come from skipping this.

1. **RLS on every table in `public`, no exceptions.** Every `create table` in `schema.sql` is immediately followed by `alter table ... enable row level security;` and explicit policies. A table without RLS is readable and writable by anyone with the anon key.
2. **Policies scoped to the owner.** Use `auth.uid() = user_id` (or a membership check for shared data like groups). Write separate policies for select / insert / update / delete. Insert and update policies need `with check`, so users can't write rows owned by someone else.
3. **No blanket policies.** Never `using (true)` for writes. Only use it for reads on data that is genuinely public.
4. **Service role key = server only.** It bypasses RLS. It lives only in `server/.env` and the Render env vars, never in `/client`, never in a `VITE_` variable, never committed.
5. **Server routes still check ownership.** Because the server uses the service role key, every route that reads or writes user data uses `requireUser` and filters by `req.user.id` itself.
6. **Storage buckets private by default.** Use storage policies that limit access to the owner's folder (e.g. path starts with `auth.uid()`). Use signed URLs for sharing instead of public buckets.
7. **Views and functions.** Create views with `security_invoker = true` so they respect RLS. Avoid `security definer` functions; if one is needed, set `search_path` and check `auth.uid()` inside it.
8. **Don't trust client input.** Never accept `user_id` from the request body; take it from the verified token.
9. **Don't expose secrets in errors.** The error handler returns generic messages in production, not raw database errors.
10. **Verify before demo.** Run Supabase's Security Advisor (Dashboard → Advisors) and fix every warning. Also test: log in as user A and try to read user B's rows via the anon key; it must return nothing.

Add a short "Security checklist" section to README with items 1–10 so teammates follow it when adding tables.

## Step 5: AI module (/server/ai)

Meta Model API facts (verify against dev.meta.ai/docs if anything fails):
- Base URL: `https://api.meta.ai/v1`
- Auth: `Authorization: Bearer $MODEL_API_KEY`
- Models: `muse-spark-1.3` (default), `muse-spark-1.2`, `muse-spark-1.1`
- Works with the OpenAI SDK by setting the base URL; supports Chat Completions and structured output

1. Install `openai` in `/server`.
2. Create `server/ai/client.js`:
   - OpenAI client with `baseURL: "https://api.meta.ai/v1"` and `apiKey: process.env.MODEL_API_KEY`; model from `MUSE_MODEL`
   - `generateJSON({ system, prompt, schemaHint })`: uses Muse structured output if supported (check the Structured output guide), otherwise instructs strict JSON; parses, retries once on invalid JSON, throws a clean error otherwise
   - `generateText({ system, prompt })`
   - In-memory cache keyed by model + prompt (we only have $50 of credits; also helps demo reliability)
   - `MOCK_AI=true` flag that returns canned responses from `server/ai/mocks/` without calling the API, for UI work
   - Timeout handling and a log line with token usage per call so we can track spend
3. Create `server/ai/test.js`: lists models (`GET /models`) and runs one sample `generateJSON` call, printing the result.
4. Add `POST /api/ai/test` route that calls `generateText` with a fixed prompt (remove later).
5. If `MODEL_API_KEY` is missing, skip the live call and tell me.

## Step 6: Local run

- Root `package.json` with a `dev` script that runs client and server together (use `concurrently`).
- Update README with: install, env setup (where to find each Supabase/Meta key), `npm run dev`.
- Verify the client's health badge shows ok against the local server, and that signup → login → `/app` works.

## Step 7: Deploy prep

Prepare config so deploying takes minutes once we log in (I will handle logins):

- Client → Vercel: root directory `client`, build `npm run build`, output `dist`, env `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Add `vercel.json` with SPA rewrites.
- Server → Render (or Railway): root directory `server`, start `npm start`, env vars from `server/.env.example`.
- Supabase: add the Vercel URL to Auth → URL Configuration (site URL + redirect URLs).
- Write the exact deploy steps into `DEPLOY.md`, marking which steps need me (login, connecting the repo, pasting secrets).

## Step 8: Hand-off

When done, report:

- What was created and verified
- Anything that failed or needs my input (keys, logins, SQL to run)
- The commands each teammate runs after cloning

Then stop. Do not build features until we give you the idea and API.md is filled in.

## After setup: team workflow (for reference)

- Branches: `feat/<a|b|c>-<task>`, `fix/<a|b|c>-<task>`; merged within 1–3 hours
- `git pull --rebase origin main` before starting and before each PR
- PRs reviewed + merged by Dev A; `main` auto-deploys and must always be demo-able
- Contract changes: update `API.md` + post in team chat
- Schema changes: add to `supabase/schema.sql` with RLS + policies in the same change (Step 4b), then post in team chat
- Run Supabase Security Advisor before the H18 freeze
- Use `MOCK_AI=true` while building UI; check Meta credit usage around H12
- Tags: `v0.1-mvp` at H12, `v1.0-demo` at H18 (feature freeze)
