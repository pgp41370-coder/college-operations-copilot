# Deployment

Actual production configuration, verified on 30 Sep 2026. **Status: deployed, database connected, NOT yet live.** Signed-in end-to-end testing in production has not been done yet (see "Remaining steps").

## Topology

| Component | Configuration |
|---|---|
| Hosting | Vercel, **Hobby** plan, team `lakh-datar`, project `college-operations-copilot` |
| Production URL | https://college-operations-copilot.vercel.app |
| Function region | `iad1` (Washington, D.C.), co-located with the database |
| Database | **Neon Postgres, Free plan**, resource `neon-champagne-marble`, AWS `us-east-1`, PostgreSQL 18, connected through the Vercel Marketplace integration |
| Deploy method | Vercel CLI (`vercel deploy --prod`) from a clean checkout of `main`. The Git auto-deploy link is **not** active (the Vercel GitHub App has no access to the private repo). |
| Source | Private GitHub repo `pgp41370-coder/college-operations-copilot` |
| Paid resources | None |

## Environment variables (names only)

The Neon integration provisioned these for Production, Preview and Development. All are encrypted in Vercel; none is `NEXT_PUBLIC_*`.

- **Used by the app:**
  - `DATABASE_URL`: pooled connection, used at runtime.
  - `DATABASE_URL_UNPOOLED`: direct connection, preferred by migrations.
- **Present but unused:** `PGHOST`, `PGHOST_UNPOOLED`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `POSTGRES_*`, `NEON_PROJECT_ID`, `NEON_AUTH_BASE_URL`, `VITE_NEON_AUTH_URL`.
- **Not set:** `AI_*`. The optional LLM adapter is off.

## Migrations

- `npm run vercel-build` runs `scripts/migrate.ts --if-configured` before `next build`, so every deployment applies any pending migration (idempotent).
- Migration `001_init.sql` was applied to production on 30 Sep 2026, and the built-in template was seeded.
- The production schema was compared object by object with a freshly migrated reference database. Tables, columns, indexes and constraints are identical:
  - 13 app tables plus `schema_migrations`, 125 columns
  - 28 indexes
  - 14 primary keys, 23 foreign keys, 5 unique constraints, 13 check constraints
  - `pgcrypto`
  - PostgreSQL 18 also lists NOT NULL constraints in its catalog; this was excluded from the comparison because nullability is already compared per column.

## Health endpoints

| Endpoint | Expected in production |
|---|---|
| `/api/health` | `{"ok":true,"database":"connected","migrated":true,"migrations":"current",...}` |
| `/api/health/db` | `ok: true`, `migrations: current`, `tablesPresent: 13/13`, `missingTables: []`, `templatesSeeded ≥ 1` |

Neither endpoint returns connection strings, hostnames or data.

## Security notes

- Real reference documents (`reference-data/`) are git-ignored and excluded by `.vercelignore`. The deployment's file list was checked: none were uploaded.
- `.env.local`, `.env.production.local`, `.local-credentials` and `.vercel` are git-ignored.
- **Warning: `.env.local` now contains the PRODUCTION database credentials.** Neon's variables target Development too. A local `npm run dev` would therefore read and write the production database. For local development, set a local `DATABASE_URL` in `.env.development.local`, or run `npm run dev` with `DATABASE_URL` pointing at a local database. Automated tests are isolated from this: Vitest uses its own local test database, and Playwright blanks all `PG*` variables.

## Creating the first administrator

Accounts are created by an administrator; there is no public sign-up. The first admin is created from a local terminal against the production database. The password is typed into a hidden prompt (raw terminal mode, not echoed). It is never passed on the command line and never stored in plain text.

```bash
npx tsx --env-file=.env.local scripts/create-user.ts --email you@example.edu --name "Your Name" --role admin
```

## Remaining steps before calling the deployment live

1. Create the first administrator (command above).
2. Run the signed-in production smoke test: log in, dashboard, create an activity, upload a PDF and an image, OCR, provenance, date-conflict handling, attendance review, report generation, approval, DOCX/PDF download, and log out. Use synthetic documents only; never upload `reference-data/` to the deployment.
3. Optional: give the Vercel GitHub App access to the repo so that pushes to `main` deploy automatically (GitHub → Settings → Applications → Vercel → Configure).

## Deployment history

| Date | Commit | Result |
|---|---|---|
| 29 Sep 2026 | `bcd9075` | Ready (no database) |
| 29 Sep 2026 | `6f89224`, `7119b13` | Blocked by Vercel `TEAM_ACCESS_REQUIRED` (commit author not linked to the Vercel account) |
| 30 Sep 2026 | `0f6d7c7` | Ready, after the owner connected GitHub under Login Connections |
| 30 Sep 2026 | `660f20d` | **Ready, current production.** Database connected, migrations current, region `iad1` |
