# Atlas standalone architecture

## Migration decision

The standalone edition uses the existing React UI with standard Next.js App Router on the Node.js runtime. Supabase Auth owns email/password accounts, confirmation, password recovery, and session refresh. PostgreSQL stores records in a private `atlas` schema. Supabase Storage stores documents in a private `atlas-documents` bucket. Vercel hosts Next.js; any compatible Node.js host can also run it.

## Trust boundaries

Requests are authenticated by validating the Supabase user on the server. Client-supplied identity headers are ignored. Server-side SQL uses parameter binding and explicit owner predicates. Each database transaction also applies a restricted database role and a transaction-local student ID; row-level security is enforced on every table. The private schema is not exposed by the Supabase Data API. Writes require the configured application origin and a CSRF header.

Document files use private server-managed storage; the browser never gets an administrative key. Uploads are validated and limited to 4 MB to fit Vercel request limits. Metadata and object storage use compensating cleanup and retry-safe deletion. Each record carries a version for optimistic concurrency. Application changes and stage history share a SQL transaction.

## Interfaces

- `/login`, `/signup`, `/forgot-password`, `/reset-password`: independent account UI.
- `/auth/confirm`, `/auth/callback`: confirmation and recovery callbacks.
- `/api/auth/*`: bounded, validated account actions with provider rate limiting and origin checks.
- `/api/*`: the existing Atlas HTTP contract, backed by PostgreSQL and private storage.
- `/api/health`: minimal readiness response; no secrets or user data.
- `/demo`: read-only fictional sample, usable before account configuration.

## Deployment

Secrets remain in local or host environment variables. SQL migrations are run explicitly by the owner, never during page requests or public builds. CI runs type checking, lint, PostgreSQL integration tests, authentication contract tests and a Next.js production build. Existing ChatGPT-hosted data is a separate dataset; moving it requires an explicit export and mapping to the new Supabase user IDs.
