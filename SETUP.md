# Setup

## Local development

Local development needs:

- **Node.js 20.9 or later.** Development used Node 24.
- **PostgreSQL 14 or later.** Development used PostgreSQL 16 via Homebrew.
- **Tesseract and Poppler (optional).** These are only needed for the reference-case tests and for the pilot fixture loader. Install them with `brew install tesseract poppler`.

```bash
npm install
```

```bash
createdb college_ops_dev
```

```bash
cp .env.example .env.local
```

Set `DATABASE_URL` in `.env.local`, then:

```bash
DATABASE_URL=postgres://localhost:5432/college_ops_dev npm run db:migrate
```

Create the first administrator. You will be asked for the password in a hidden prompt; it is never taken as a command-line argument:

```bash
DATABASE_URL=postgres://localhost:5432/college_ops_dev npm run user:create -- --email you@college.edu --name "Your Name" --role admin
```

```bash
npm run dev
```

Administrators create more users under **Settings → Users**. There is no public sign-up.

### Pilot fixtures (local only)

`npm run fixtures:load` loads the two KDK reference packets from `reference-data/` as activities owned by an existing user. It uses the same service code as the app, with Tesseract CLI for OCR. These are real documents that contain student names and signatures. Do not load them into a public deployment unless the institution has authorized it.

```bash
DATABASE_URL=postgres://localhost:5432/college_ops_dev npm run fixtures:load -- --owner you@college.edu
```

## Tests

| Command | What it runs |
|---|---|
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest: unit, Postgres integration, permissions, exports, and the KDK reference cases (skipped automatically when `reference-data/` or the OCR tools are absent). Recreates the `college_ops_test` database. |
| `npm run build && npm run test:e2e` | Playwright against the production build on port 3100 with a fresh `college_ops_e2e` database. The browser-OCR test downloads the Tesseract engine from jsDelivr, so it needs network access. |

The Playwright browser is installed once with `npx playwright install chromium`.

## Deployment (Vercel)

The app is designed for Vercel's free **Hobby** plan together with a free-tier Postgres database. Nothing in the app requires a paid service.

### 1. Database (manual step)

A hosted Postgres database is required. Creating one means accepting the provider's terms, so the account owner has to do it. Either option works:

**Option A — Neon through the Vercel Marketplace (free plan).** Run this from the project folder after it is linked (`vercel link`):

```bash
vercel integration add neon
```

Choose the **Free** plan. Choose a region close to the users (Mumbai `aws-ap-south-1` if offered, otherwise Singapore). Connect the database to this project. The integration adds `DATABASE_URL` to the project's environment variables automatically.

**Option B — any existing free Postgres (Neon or Supabase dashboard).** Copy its **pooled** connection string, then:

```bash
vercel env add DATABASE_URL production
```

### 2. Deploy

```bash
vercel deploy --prod
```

`vercel-build` runs `scripts/migrate.ts --if-configured` and then `next build`. Migrations run when `DATABASE_URL` is present. When it is absent, the build still succeeds, but the app reports "database not configured" and no one can sign in.

### 3. Create the first administrator in the hosted database

Run this locally against the hosted `DATABASE_URL`. The password is entered at a hidden prompt:

```bash
vercel env pull .env.production.local --environment=production
```

```bash
set -a && source .env.production.local && set +a && npm run user:create -- --email you@college.edu --name "Your Name" --role admin
```

Delete `.env.production.local` afterwards. It is git-ignored, but it contains the database credentials.

### 4. Verify

- `GET /api/health` should return `{"ok":true,"database":"connected","migrated":true,...}`.
- Sign in, create an activity, upload a document, generate reports, approve, and export.

### Region

`vercel.json` pins the serverless functions to `bom1` (Mumbai) to be close to users in Nagpur. If the database is in another region, every query crosses regions. The app still works but is slower.

## Optional: LLM-assisted extraction

This is off by default. To enable it, set all of:

- `AI_PROVIDER=openai_compatible`
- `AI_BASE_URL`, for example `http://localhost:11434/v1` for a local Ollama server
- `AI_MODEL`
- `AI_API_KEY`, if the endpoint needs one

Any hosted endpoint may charge for use. It is not configured or required, and no paid API is used by default. LLM output is used only to propose field values backed by a verbatim quote from the document. See ARCHITECTURE.md.

## Paid services

None are used or required. No paid substitution has been made anywhere.
