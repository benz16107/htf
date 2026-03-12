# Pentagon

Multi-tenant supply chain risk platform with:

- Company onboarding setup wizard (base layer, integrations, high-level profile)
- Internal dashboard pages (triggered risk, assessment, plans, post-analysis, logs)
- Session-based traceability foundations for explainable agent reasoning
- Prisma data model for companies, sessions, traces, risk cases, scenarios, and policies

## Design

Token-based design system in `src/app/globals.css` with a minimal Google Workspace-style direction (Material 3 foundations, restrained surfaces, icon+label controls, shared app shells). See `DESIGN_SYSTEM.md` for current tokens and component rules.

## Stack

- Next.js (App Router) + TypeScript
- Prisma ORM + PostgreSQL
- Built-in email/password auth with secure HTTP-only session cookies
- Gemini/Backboard adapters scaffolded in `src/server`

## Local Run

1. Install deps:

	```bash
	npm install
	```

2. Copy env:

	```bash
	cp .env.example .env
	```

3. **Zapier integration (no app publish required)**  
   Use **Zapier via Webhooks**: in Zapier create a Zap with trigger **Webhooks by Zapier → Catch Hook**, add your action (e.g. Gmail, Slack), then in the app paste the webhook URL under Setup → Integrations (or Dashboard → Integrations). The AI can then trigger that Zap by name when running mitigation actions. No OAuth or publishing.  
   Optional: set `ZAPIER_ACCESS_TOKEN` in `.env` (from one-time OAuth once your app is published) to list Zapier apps and choose connector labels for the company profile.

4. **Direct Gmail email sync (optional)**  
   To connect Gmail directly for internal email signals, set:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI` (optional; if omitted the app uses `<origin>/api/email/google/callback`)
   - `GOOGLE_PUBSUB_TOPIC_NAME` (required for Gmail push/watch)
   - `GOOGLE_PUBSUB_VERIFICATION_TOKEN` (shared secret appended to the push endpoint URL)
   
   In Google Cloud, enable the Gmail API and add your callback URI to the OAuth client’s authorized redirect URIs.
   For true live inbox sync, also:
   - create a Pub/Sub topic that matches `GOOGLE_PUBSUB_TOPIC_NAME`
   - create a Pub/Sub push subscription pointing to the app’s Gmail push endpoint shown in Integrations
   - after connecting Gmail in the app, click `Enable Gmail push`
   
   The app stores the Gmail `historyId`, receives Pub/Sub push notifications, ingests new inbox emails as internal signals, and renews Gmail watches from the existing cron route.

5. Generate Prisma client:

	```bash
	npm run prisma:generate
	```

6. Start app:

	```bash
	npm run dev
	```

Visit http://localhost:3000.

## Deploy (Vercel)

1. **Push to GitHub** and import the repo in [Vercel](https://vercel.com). Vercel will detect Next.js and use `npm run build` (Prisma client is generated via `postinstall`).

2. **Production database**  
   Create a Postgres database (e.g. [Neon](https://neon.tech), [Supabase](https://supabase.com), or [Vercel Postgres](https://vercel.com/storage/postgres)), then set `DATABASE_URL` in the Vercel project **Environment Variables**.  
   If you see `prepared statement "s1" already exists` with Supabase on Vercel, use **Prisma Accelerate**: sign up at [console.prisma.io](https://console.prisma.io), add your Supabase URL, enable Accelerate, and set `DATABASE_URL` to the `prisma://accelerate.prisma-data.net/?api_key=...` URL.

3. **Run migrations** against the production DB (once):
   ```bash
   DATABASE_URL="postgresql://..." npx prisma migrate deploy
   ```

4. **Set all env vars** in Vercel (Production + Preview if you want):
   - `DATABASE_URL`, `NEXT_PUBLIC_APP_URL` (e.g. `https://your-app.vercel.app`)
   - `SESSION_SECRET` (required for signed auth sessions)
   - `GEMINI_API_KEY`, `GEMINI_MODEL` (optional global default), `BACKBOARD_API_KEY` (if used)
   - `NEXT_PUBLIC_ZAPIER_MCP_EMBED_ID`, `ZAPIER_MCP_EMBED_SECRET` (for Zapier MCP embed)
   - `INTERNAL_API_SECRET` (recommended for internal autonomous/live-ingest route auth)
   - `CRON_SECRET` – required for the autonomous agent to keep running in the background when no one is on the page. Vercel Cron hits `/api/cron/autonomous` every 2 minutes and sends this as a Bearer token; set it in Vercel env and the cron will run for all companies with the agent turned on.

5. **Zapier MCP embed**  
   In [mcp.zapier.com → Embed config → Allowed domains](https://mcp.zapier.com/manage/embed/config), add your Vercel hostname (e.g. `your-app.vercel.app`) so the embed can load in production.

Redeploy after changing env vars.

## Current Auth Mode

- Built-in email/password auth at `/sign-in` and `/sign-up`.
- Auth sessions are signed and stored in secure HTTP-only cookies (`SESSION_SECRET` required).
- The app uses a single company-account model: one company creates one account
	and that account owns setup/dashboard access.

## Setup Data Persistence

Setup wizard data now persists to PostgreSQL using Prisma tables:

- `CompanyProfileBase`
- `IntegrationConnection`
- `CompanyProfileHighLevel`
- `Company.setupCompleted`

The setup review/profile pages read directly from the database.

Legacy setup cookies have been removed from the setup flow.

## Key Paths

- `src/app/sign-in/page.tsx` – auth entry
- `src/app/setup/*` – setup flow
- `src/app/dashboard/*` – main internal tabs
- `src/app/profile/page.tsx` – company profile view
- `src/server/agents/*` – agent service scaffolds
- `prisma/schema.prisma` – multi-tenant data model
