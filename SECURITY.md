# Security

## Authentication

- Email and password. Passwords are hashed with bcrypt (cost 11) and must be at least 10 characters.
- The server issues a random 256-bit session token in an `httpOnly`, `SameSite=Lax` cookie. The cookie is `Secure` in production and lasts 7 days. Only the SHA-256 of the token is stored in the database.
- There is no self-registration. An administrator creates accounts from Settings, or with `scripts/create-user.ts`, which reads the password from a hidden prompt and never from command-line arguments.
- Deactivating a user or resetting their password revokes their sessions.
- For unknown emails, the server still performs a bcrypt comparison against a dummy hash. This keeps response timing the same, so timing does not reveal which emails exist.

## Authorization

- **Faculty** can access only activities they own, together with those activities' files, extractions, attendance, reports and exports.
- **Administrators** can access everything, which gives the institution oversight.
- Access is enforced in the service layer (`getActivity` / `getSourceForUser`) for every read and write.
- Records the user may not access return **404**, not 403, so their existence is not revealed.
- Tests cover cross-user reads, downloads, edits, approval and extraction (`tests/integration/permissions.test.ts`, E2E).
- Approved and archived activities are read-only. Only an administrator can reopen one, and must give a reason.

## Request protection

- Every mutating API call requires the `Origin` header to match the host, which prevents CSRF. This works alongside the SameSite cookies.
- All input is validated with zod. Fields are validated by type (dates, times and integers are parsed, never guessed).
- Database queries are parameterized through postgres.js tagged templates.
- Rate limits are stored in Postgres, so they hold across serverless instances:

  | Action | Limit |
  |---|---|
  | Login, per email | 8 per 15 min |
  | Login, per IP | 30 per 15 min |
  | Uploads, per user | 120 per hour |
  | Password change, per user | 10 per 15 min |
  | LLM extraction, per user | 20 per hour |

- Uploads are limited to PDF, JPEG and PNG, detected by **magic bytes**, not by the name the browser sends. The extension must match the content. PDFs must parse and PNGs must be complete.
- Uploads must be larger than 0 bytes and no larger than 4 MB. An activity can hold at most 40 files, and duplicates are rejected by SHA-256.
- Filenames are sanitized.
- Files are served with `Content-Disposition`, `X-Content-Type-Options: nosniff` and `Cache-Control: private, no-store`.
- In CSV exports, cells that begin with `= + - @` are prefixed with `'` so spreadsheets do not treat them as formulas.

## Secrets and logging

- No secrets are in the repository. `.env*` is git-ignored except `.env.example`.
- `DATABASE_URL` and `AI_API_KEY` are read only on the server. Nothing secret is exposed to the browser. `/api/health` reports status only, never configuration.
- Error handling logs the error name and message only. Request bodies, document text, passwords and tokens are never logged.
- Audit entries store identifiers, field keys and values truncated to 200 characters. They never store document text or credentials.

## Data protection

- The real reference documents in `reference-data/` are git-ignored and are never deployed.
- Uploaded files live in the database, not in public storage, so there are no public URLs.
- OCR runs in the user's browser, so documents are not sent to external OCR services.

## Known gaps

- No MFA and no self-service password reset. There is no email service; an administrator resets passwords.
- No malware scanning of uploads. PDFs are parsed with pdf-lib and never executed. Browsers render them in their built-in sandboxed viewer.
- The server does not independently verify browser-submitted extraction text. That text comes from the authenticated owner, who is also the reviewer.
- Access control is enforced in application code. Postgres row-level security is not used, because the app connects with a single database role.
