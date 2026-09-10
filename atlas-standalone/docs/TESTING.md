# Standalone verification report

Verified on 10 September 2026. This report applies to the Next.js/Supabase edition. Checks performed on the earlier ChatGPT-hosted edition are not counted as verification of this migration.

## Completed checks

- TypeScript checking: passed.
- ESLint: passed.
- Next.js production compilation and route generation: passed.
- Automated tests: **71 passed, 0 failed**, including the three parent test entries.

Run `npm run check` to repeat the local release checks. The GitHub Actions workflow runs the same checks without production secrets.

## Database and application workflows

`tests/integration.test.mjs` runs the actual schema and SQL adapter against PGlite, an embedded PostgreSQL runtime. It uses an isolated temporary database and document directory, two fictional student identities, and the production HTTP handlers.

Covered workflows include company and application CRUD; required fields and invalid input; atomic stage changes and history; simultaneous/stale edits; interview scheduling, time zones, rescheduling and completion; notes; upload/download validation and exact bytes; document metadata; deletion restrictions and retry after a storage outage; quotas and rate limits; analytics; persistence after reopening the database; transaction rollback; foreign keys; and row-level isolation between users, including unfiltered SQL and cross-owner links.

Test identities are injected through a test-only dependency. Production validates Supabase identity and ignores caller-supplied identity headers. Tests explicitly verify that forged ChatGPT identity headers do not grant access.

## Authentication and storage contracts

`tests/auth.test.mjs` uses the real Supabase JavaScript/SSR clients with controlled HTTP responses. It covers sign-up, validation, sign-in, verified identities, cookies, recovery email requests, token-hash and PKCE callbacks, invalid/consumed links, password changes, sign-out, open-redirect prevention, cross-origin rejection and attempt limits.

`tests/storage.test.mjs` uses the real Supabase client with controlled Storage responses. It covers private uploads without overwrite, authorized downloads with exact bytes, missing objects, service failures and precise object deletion.

These tests verify application behavior and SDK integration. They do not provision or contact a real Supabase project, send real email, or prove deployed provider permissions.

## Live Supabase checks

A dedicated project was created in Kian Projects, Singapore, on 10 September 2026. The application, private bucket and RLS optimization migrations were applied successfully and recorded in both provider migration history and the application's checksum history.

Direct queries against the hosted database verified owner creation, reads, updates and deletion; rejection of cross-owner inserts, updates and deletes; composite foreign-key ownership; and isolation when switching the transaction-local owner between statements. The checks were repeated after optimizing the policies. All temporary records were rolled back.

All seven application tables enforce row-level security. Neither `anon` nor `authenticated` has usage access to the private schema. The document bucket is private, has a 4 MiB limit and the expected MIME types, and has no public object policies. Actual hosted file upload/download remains unverified until the runtime server key is configured.

Supabase's security advisor returned no findings. The RLS initialization-plan warning was fixed by a new migration. The remaining performance findings are six informational [unused-index notices](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index), expected in a new empty project; indexes used by planned application queries were retained.

The Supabase CLI download could not complete in this environment. The final migration was applied through Supabase's migration tool and exported under its returned migration version. Existing migration files were not modified.

## Browser status

The desktop sample workspace rendered and was visually inspected. Interactive navigation could not be verified in this preview: clicking Applications did not change the view, and the development runtime reported `uv_resident_set_memory` errors in its restricted environment. A production browser check is still required; this report does not claim that interaction checks passed.

Mobile/tablet checks and all signed-in browser workflows remain to be repeated on the independent deployment. The responsive UI is included, but earlier browser results from the hosted edition are not a substitute for these checks.

## Before opening the site to students

Complete the live acceptance checks in [DEPLOYMENT.md](DEPLOYMENT.md) after configuring Supabase, SMTP and the host. Verify account confirmation and password recovery with delivered emails, all workspace mutations, document access, two-account isolation, refresh/persistence, browser navigation and phone layouts.

The hosted PostgreSQL schema and access policies were verified through the provider connection. Connections from the deployed Next.js runtime, pooler settings, email delivery, production cookies and hosting configuration have not yet been tested in the user's accounts. Load testing, an independent security audit, malware scanning and backup restore drills are outside this test suite. No real student records were used.
