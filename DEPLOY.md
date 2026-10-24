# Deploy

Order: **Supabase → Render (server) → Vercel (client) → back-fill URLs.**
Steps marked **[YOU]** need a login, connecting the repo, or pasting secrets.

## 1. Supabase

1. **[YOU]** Create the project at supabase.com (or reuse the dev one).
2. **[YOU]** SQL Editor → run `supabase/schema.sql`, then `supabase/seed.sql`.
3. **[YOU]** Authentication → Sign In / Providers → Email enabled, "Confirm email" off.
4. Copy from Project Settings → API: Project URL, `anon`/publishable key, `service_role`/secret key.

## 2. Server → Render

1. **[YOU]** Log in at render.com → **New → Web Service** → connect GitHub repo `nav21/HackTX-26` (grant Render access to the private repo).
2. Settings:
   - Root Directory: `server`
   - Runtime: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Health Check Path: `/api/health`
   - Instance: Free is fine (it sleeps after ~15 min idle; hit `/api/health` a minute before the demo to wake it).
3. **[YOU]** Environment variables (paste secrets):

   | Key | Value |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `CLIENT_URL` | Vercel URL from step 3 (fill in after; e.g. `https://hacktx-26.vercel.app`) |
   | `SUPABASE_URL` | Project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key |
   | `MODEL_API_KEY` | Meta key |
   | `MUSE_MODEL` | `muse-spark-1.3` |
   | `MOCK_AI` | empty (or `true` to save credits) |

   Don't set `PORT`; Render provides it.
4. Deploy, then check `https://<service>.onrender.com/api/health` → `{"status":"ok","db":"ok"}`.

## 3. Client → Vercel

1. **[YOU]** Log in at vercel.com → **Add New → Project** → import `nav21/HackTX-26`.
2. Settings:
   - Root Directory: `client`
   - Framework Preset: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - `client/vercel.json` already rewrites all routes to `index.html` so `/login` and `/app` work on refresh.
3. **[YOU]** Environment variables:

   | Key | Value |
   | --- | --- |
   | `VITE_API_URL` | Render URL, e.g. `https://hacktx-26.onrender.com` (no trailing slash) |
   | `VITE_SUPABASE_URL` | Project URL |
   | `VITE_SUPABASE_ANON_KEY` | anon / publishable key |

   `VITE_` vars are baked in at build time: after changing them, redeploy.
4. Deploy.

## 4. Back-fill URLs

1. **[YOU]** Render → env → set `CLIENT_URL` to the Vercel production URL → save (auto-redeploys).
   Vercel preview URLs (`*-git-*.vercel.app`) aren't in CORS by default; add them comma-separated to `CLIENT_URL` if you need them.
2. **[YOU]** Supabase → Authentication → URL Configuration:
   - Site URL: the Vercel URL
   - Redirect URLs: `https://<vercel-url>/**` and `http://localhost:5173/**`
3. Fill in `Base URL:` at the top of `API.md` with the Render URL.

## 5. Smoke test

- Vercel URL → `/app` shows the health badge ok.
- Sign up → lands on `/app` → refresh stays logged in → sign out works.
- `curl -X POST https://<render-url>/api/ai/test` returns text (this spends credits; remove the route after setup).

Both services auto-deploy on push to `main`.
