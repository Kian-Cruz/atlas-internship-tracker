# Deploy Atlas in your own accounts

This project is standard Next.js. Your GitHub repository owns the code, Supabase owns your user accounts and data, and Vercel hosts the app. A paid custom domain is optional. For the already provisioned Atlas project, start with [PROJECT_SETUP.md](PROJECT_SETUP.md); its applied migrations must not be run manually a second time.

The `Kian-Cruz/atlas-internship-tracker` repository already contains the app in `atlas-standalone/`. Its Supabase migrations are already applied. Run npm commands from that application directory; skip account creation and the initial upload steps below when using the existing setup.

## 1. Create a dedicated Supabase project

1. Open https://supabase.com/dashboard and create a project in your own organization.
2. Save the database password in your password manager. Choose a region close to your users and use the same region for Vercel where available.
3. Copy the project URL and **publishable key** from the project's Connect/API settings.
4. Copy a **server secret key**, or the legacy `service_role` key. This key belongs only in `SUPABASE_SECRET_KEY`; never expose it in frontend variables.
5. Open **Connect** and copy the **Transaction pooler** PostgreSQL URI for `DATABASE_URL` (normally port 6543).
6. Copy the **Session pooler** URI for `DATABASE_MIGRATION_URL` (normally port 5432). A direct URI also works where your network supports it.
7. Put these values into `.env.local`. URL-encode special characters in the database password. Do not replace TLS verification with an insecure workaround.

The publishable key and project URL are public identifiers. The server key and database URIs are secrets. Atlas does not need a Supabase personal access token at runtime.

## 2. Apply the database and storage migrations

Run locally, from the project directory:

```bash
npm ci
npm run setup:check
npm run db:migrate
```

This project's newest migrations add a `skill_analyses` table (and a `skill_progress` column on it) for the Skills panel. Apply them the same way as the others; neither touches existing data.

The migration runner records a checksum for each applied SQL file, skips completed migrations, and rejects edits to previously applied files. Run it again for future migrations. Do not run migrations as part of a public HTTP route or every Vercel build.

The first migration creates the private `atlas` schema, the restricted `atlas_app` role, row-level security, indexes and relationships. The second creates the private `atlas-documents` storage bucket with a 4 MiB file limit. The later RLS migration evaluates the transaction-local owner once per statement. Runtime SQL always switches to the restricted role and sets the verified student ID inside the transaction. The private schema must **not** be added to Supabase's exposed Data API schemas. Do not create broad storage policies allowing public access to this bucket.

If you prefer SQL Editor, execute all SQL files in filename order once. Use either SQL Editor or the supplied migration runner for the initial setup; do not mix them without reconciling migration history.

## 3. Configure email and authentication

In Supabase Authentication:

- Enable **Email** sign-in and keep **Confirm email** enabled.
- Set the minimum password length to **12** to match Atlas validation.
- Set **Site URL** to `http://localhost:3000` during local development, then to your final HTTPS site address for production.
- Add the exact allowed redirect URLs: `http://localhost:3000/auth/callback` and `http://localhost:3000/auth/callback?next=/reset-password`, plus the equivalent URLs on your final production domain. Use a separate development project if you need development links after launch.
- Configure a custom SMTP provider for production confirmation/recovery mail. Supabase's default mail service has restrictions and is not a substitute for production email delivery.

New Free plan projects using the default SMTP provider cannot customize email templates. Configure custom SMTP first. For server-side confirmation that also works when a link is opened on another device, use these custom email templates. Replace the corresponding template link; keep the rest of your template as desired.

**Confirm signup**:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup">Confirm your Atlas account</a>
```

**Reset password**:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Reset your Atlas password</a>
```

The app also supports PKCE callbacks when using Supabase's normal redirect links; those must be opened in the browser that initiated the request. Tokens are single use. Email scanners that automatically visit links can consume them; configure your mail provider appropriately and test real delivered messages.

Authentication is handled server-side. Production cookies use HttpOnly, Secure and SameSite=Lax. APIs revalidate identity with Supabase Auth. Account attempts are bounded per email, and Supabase's provider rate limits remain active. Configure hosting request-rate protections for a public launch. After a password reset, Atlas requests sign-out for all sessions; already-issued access tokens follow Supabase's configured expiry/revocation behavior.

## 4. Put the source in GitHub

Create a **private repository** named `atlas-internship-tracker` under your account. If ChatGPT will upload the files through the connected GitHub integration, initialize it with a README and give the integration access to that repository. Send the repository URL.

If uploading from your computer instead, create an empty repository without a README, extract the project, open it in VS Code and run:

```bash
git init
git add .
git commit -m "Build standalone Atlas internship tracker"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/atlas-internship-tracker.git
git push -u origin main
```

The `.gitignore` excludes `.env.local`, build output and dependencies. Check `git status` before committing. The included GitHub Actions workflow validates every push and pull request, without requiring production secrets.

## 5. Deploy to Vercel

1. Open https://vercel.com/new and import your repository.
2. Use the **Next.js** framework preset and Node.js **22.x or 24.x**. For `Kian-Cruz/atlas-internship-tracker`, set **Root Directory** to `atlas-standalone`. If adapting this project to another repository, select the directory containing `package.json`.
3. Add these environment variables for the production environment:

| Variable | Value |
| --- | --- |
| `APP_URL` | Your exact public HTTPS origin, with no path |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |
| `SUPABASE_SECRET_KEY` | Supabase server secret or legacy service_role key |
| `DATABASE_URL` | Supabase transaction pooler URI |
| `ANTHROPIC_API_KEY` *(optional)* | Enables the Skills panel (résumé vs. job description analysis). Omit to leave that feature disabled. |

Do not add `DATABASE_MIGRATION_URL` to Vercel; it is for the local migration command. Configure the server key and database URI as sensitive secrets. Do not put them in `vercel.json`.

4. Deploy. If the final domain wasn't known beforehand, copy the assigned domain into `APP_URL`, update Supabase's Site URL/redirect settings and redeploy before using sign-in.
5. Keep Vercel preview deployments protected or use a separate Supabase project for previews. The app deliberately checks the exact `APP_URL` on writes; arbitrary preview domains won't be accepted.
6. Visit `/api/health` on your deployed site, then perform the live acceptance checks below.

Subsequent pushes to the branch connected to Vercel trigger its configured deployment workflow. Apply any new migrations deliberately before deploying code that needs them. Environment variable changes require a fresh deployment.

## 6. Live acceptance checks

These require your configured accounts; local tests cannot prove production email delivery, TLS/DNS or account permissions.

1. Create a new account using a real email address and confirm it.
2. Sign in, add a company and application, move stages, schedule an interview, and write a note.
3. Upload, download and delete a harmless document under 4 MiB.
4. Sign out, sign back in and check that records persist.
5. Reset the password through a delivered email, then sign in with the new password.
6. Use a second account to check that records and document URLs from the first account are inaccessible.
7. Check the app on a phone and inspect the Vercel/Supabase logs for errors.

## Operations and recovery

- Use your Supabase plan's database backup facilities, and maintain separate document-object backups. Database backups alone do not necessarily include Storage object bytes. Test restoration before relying on it.
- Monitor failed requests using the request ID returned by Atlas; server logs avoid recording SQL parameters, user content or secrets.
- Retry interrupted document deletion. Metadata stays marked as deleting until the object has been removed successfully.
- Set billing alerts for both providers. Periodically delete expired rate-limit records as the database owner: `DELETE FROM atlas.rate_limits WHERE reset_at < (extract(epoch FROM now()) * 1000)::bigint - 86400000;`.
- No antivirus service is bundled. If untrusted uploads require malware scanning, integrate scanning/quarantine before opening them automatically elsewhere.
- Roll back code using your host's deployment history. Review database compatibility first; schema migrations are not automatically reversed by a code rollback.
- Add a privacy notice and support contact appropriate to your deployment before inviting other students.

## Existing data

The previous ChatGPT-hosted app and this Supabase project are separate. This package does not export the old database or documents and does not alter the previous live app. A later transfer needs a verified old-owner to new-Supabase-user mapping and a controlled file copy; never import old identity headers as trusted credentials.

## Reference documentation

- https://supabase.com/docs/guides/auth/server-side/creating-a-client
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://vercel.com/docs/functions/limitations