# Atlas — Internship workspace

A standalone student internship tracker built with **Next.js 16, React 19, TypeScript, Supabase Auth, PostgreSQL, and private Supabase Storage**. Deploy to your own Vercel account, or run it on a compatible Node.js host. No ChatGPT account, Sites dispatcher, Cloudflare D1, or R2 is required by this edition.

## Included

- Email/password registration, email confirmation, sign-in, sign-out and password recovery.
- Dashboard, company records, application list and stage board.
- Interview scheduling, time-zone conversion, notes and stage history.
- Private PDF, DOCX and TXT documents with metadata, status and downloads.
- Analytics, search, filtering, pagination, responsive navigation and a read-only sample workspace.
- Server validation, optimistic concurrency, per-student quotas and write rate limits.
- PostgreSQL row-level security and composite ownership constraints.
- Explicit SQL migrations, environment checks, a locked dependency tree and GitHub Actions CI.

## Start here

For your already created Supabase project, use [docs/PROJECT_SETUP.md](docs/PROJECT_SETUP.md) and the supplied `.env.atlas.example`. Database setup and access checks are complete; GitHub upload, private runtime credentials, production email and hosting remain pending.

Use **Node.js 22.13+ or 24** and npm. You do not need Docker for the supplied tests.

```bash
npm ci
```

In Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Fill in `.env.local` using a dedicated Supabase project's settings, then:

```bash
npm run setup:check
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`. Without account configuration, `/demo` still shows the fictional sample workspace. Creating or saving real records requires the Supabase setup.

**Follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the complete Supabase, GitHub and Vercel setup, including email templates.** Do not paste secret keys into a chat, commit them to Git, or use a `NEXT_PUBLIC_` prefix for server secrets.

## Verify

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Tests use an embedded PostgreSQL engine (PGlite), real SDKs with local provider responses, and temporary files. They do not require credentials or contact a live Supabase project. [docs/TESTING.md](docs/TESTING.md) records what has and has not been verified.

## Project layout

| Path | Purpose |
| --- | --- |
| `app/` | Next.js pages, account callbacks and HTTP routes |
| `components/atlas/` | Dashboard, application management and editors |
| `components/auth/` | Account screens and sign-out |
| `lib/atlas/` | Validation, analytics, HTTP handlers and ownership checks |
| `lib/auth/` | Supabase sessions, account actions and recovery |
| `lib/platform/` | PostgreSQL and private storage adapters |
| `supabase/migrations/` | Application schema, security policies and private bucket |
| `scripts/` | Environment validation and checksum-tracked migrations |
| `tests/` | Authentication, database and storage tests |
| `.github/workflows/ci.yml` | Automated validation on pushes and pull requests |

## Operational limits

Documents are limited to **4 MiB** so multipart requests fit within Vercel's 4.5 MB function payload limit. Workspaces allow 300 companies, 500 applications, 1,000 interviews, 1,000 notes, and 100 documents. Analytics uses at most the newest 5,000 stage events. Dates display in the visitor's local time zone.

The application tracks opportunities; it does not apply to employers, send interview reminders, or scan uploads for malware. File extension and basic signature validation are provided. Configure email delivery, backups, budget alerts, monitoring and retention in your hosting accounts before onboarding students. See the deployment guide for details.

Existing records in the previous ChatGPT-hosted edition are not copied automatically. This standalone edition starts with a fresh database; any later import must map old owner identities to verified Supabase accounts. The previous live Site is unaffected.

See [ARCHITECTURE.md](ARCHITECTURE.md) for security boundaries and migration decisions.
