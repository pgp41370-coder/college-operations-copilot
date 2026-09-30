# Deployment

Actual production configuration, verified on 30 Sep 2026. **Status: LIVE.** The signed-in end-to-end smoke test passed 24/24 steps against the production URL, and the results were cross-checked in the production database (see "Production verification").

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
- **`.env.local` contains the PRODUCTION database credentials.** The Vercel CLI pulled them because Neon's variables also target Development.
  - `.env.development.local` (git-ignored) overrides them for `next dev`, pointing at the local `college_ops_dev` database with the `PG*` variables blanked. Verified with Next's own env loader.
  - A plain local `next start` still reads `.env.local`, and so the production database. The Playwright tests and the demo recorder always pass their own local `DATABASE_URL`.
  - `npx tsx --env-file=.env.local …` (used by `create-user`) targets production **on purpose**.

## Creating the first administrator

Accounts are created by an administrator; there is no public sign-up. The first admin is created from a local terminal against the production database. The password is typed into a hidden prompt (raw terminal mode, not echoed). It is never passed on the command line and never stored in plain text.

```bash
npx tsx --env-file=.env.local scripts/create-user.ts --email you@example.edu --name "Your Name" --role admin
```

## Production verification (30 Sep 2026)

The account owner ran `npx tsx scripts/prod-smoke.mts` against https://college-operations-copilot.vercel.app. Credentials were entered at a hidden prompt, and only synthetic documents were used. **Result: 24/24 steps passed.**

| Area | Verified in production |
|---|---|
| Health | `/api/health` and `/api/health/db`: database connected, migrations current, 13/13 tables |
| Authentication | Signed-out redirect to `/login`; wrong password rejected; admin login; logout closes protected routes again |
| Authorisation | A second faculty account got a 404 on the admin's activity page and on its export API |
| Upload | Digital PDF, scanned PDF, PNG and JPG accepted and stored |
| Extraction / OCR | In-browser OCR on the scanned PDF, the poster PNG and the attendance PNG; text-layer read of the digital PDF; photo stored as evidence only |
| Provenance | Each value shows its source file, page, deterministic rule and confidence |
| Conflict | Poster 31/10/2026 vs notice/report/attendance 06/11/2026 flagged as a conflict and not auto-resolved; the reviewer's choice was recorded |
| Attendance | 7 OCR rows vs 8 stated → mismatch flagged; the reviewer added a row and verified all 8 → PASS |
| Reports | Activity Report, Detailed Report and Attendance Summary generated |
| Approval | Human approval recorded (`approved_by`, `approved_at`); activity became read-only |
| Export | DOCX and PDF downloads opened and validated |
| Audit | Created, uploaded, extracted, conflict resolved, edited, generated, approved, exported and archived events all present |

Test data left in production (clearly labelled):
- one archived activity, "[SMOKE TEST] Engineering Drawing Quiz (synthetic)";
- one deactivated account `smoke-…@smoke-test.invalid`.

The full scripted workflow was also verified locally: 93 Vitest tests and 6 Playwright tests.

## Optional next steps

- Give the Vercel GitHub App access to the repository, so that pushes to `main` deploy automatically (GitHub → Settings → Applications → Vercel → Configure). Until then, deploy with `vercel deploy --prod`.
- Before loading real pilot data, confirm with the institution that uploading student attendance records is authorised.

## Deployment history

| Date | Commit | Result |
|---|---|---|
| 29 Sep 2026 | `bcd9075` | Ready (no database) |
| 29 Sep 2026 | `6f89224`, `7119b13` | Blocked by Vercel `TEAM_ACCESS_REQUIRED` (commit author not linked to the Vercel account) |
| 30 Sep 2026 | `0f6d7c7` | Ready, after the owner connected GitHub under Login Connections |
| 30 Sep 2026 | `660f20d` | Ready. Database connected, migrations current, region `iad1`. Later commits (`35d5465`, `31fb559`, `bedaf71`, `4e1fc9a`) change only scripts and docs, so the running application is identical. |
| 30 Sep 2026 | — | Production smoke test 24/24 passed; the deployment is **live** |
| 1 Oct 2026 | `f06c085` | **Ready, current production.** Docs-only changes since `660f20d` (application code identical). The first attempt returned a transient "Not authorized" error; the retry succeeded. |
