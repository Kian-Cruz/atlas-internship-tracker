# Your Atlas project

## Already configured

- Organization: **Kian Projects**.
- Supabase project: **atlas-internship-tracker**.
- Region: **Singapore (ap-southeast-1)**.
- Quoted project cost at creation: **$0/month**, on the organization's Free plan. Usage and other providers remain subject to their plans.
- Dashboard: https://supabase.com/dashboard/project/ekpsmgxcyczielnwvapw
- Project API URL: https://ekpsmgxcyczielnwvapw.supabase.co
- Private application schema: `atlas`, with seven tables and enforced row-level security.
- Private document bucket: `atlas-documents`, limited to 4 MiB PDF, DOCX and TXT files.

The included `.env.atlas.example` contains this project's public URL and active publishable key. It contains no database password or server secret. Copy it to `.env.local` and fill in the remaining values from your own Supabase dashboard. The existing Flowpilot project was not changed.

## Credentials and authentication still to configure

The connected tools expose the publishable key but not the private server key, database password, authentication settings or SMTP settings. Do not paste these private values into chat or commit them.

1. In the Supabase dashboard, obtain a server secret key from **Settings → API Keys** and place it in `SUPABASE_SECRET_KEY`.
2. Use **Connect** to obtain the complete transaction pooler URI for `DATABASE_URL`. If you do not have the database password, set one in this new project's database settings first. Use the actual supplied pooler hostname; do not guess it.
3. Obtain a session pooler or direct URI for local `DATABASE_MIGRATION_URL`. The migrations already applied in this project are recorded in `atlas_meta.migrations`, so the supplied runner can recognize and skip them by checksum.
4. Configure Supabase's Site URL and allowed redirects to match the deployed Atlas URL, keep email confirmation enabled and set the minimum password length to 12.
5. Configure production SMTP, then the confirmation and recovery templates in DEPLOYMENT.md. New Free projects using default SMTP cannot customize authentication email templates. With default templates, Atlas supports the same-browser PKCE callback path; production email delivery still needs configuration and verification.

## GitHub source and checks

Destination: https://github.com/Kian-Cruz/atlas-internship-tracker

Your local push successfully uploaded the application at commit `9bb3053bb340f7fe1f5e339f4110de14973727e1`. All 123 application files were compared with the tested source and match. The app lives in the repository's `atlas-standalone/` directory.

The hosting correction moves GitHub Actions to `.github/workflows/ci.yml` at the repository root, sets its working directory and npm cache path to the application folder, and adds a root README and environment-file exclusions. GitHub only discovers workflows in the repository-level workflows directory. The original upload had no discovered Actions runs.

The connected GitHub integration returned HTTP 403 on writes. The correction was prepared locally for your review and local Git push; it has not been published by the assistant. There is no need to re-upload or recreate the application.

## Hosting

Vercel accepted a preview deployment on 11 September 2026:

- Project/team: `kian-cruzs-projects/atlas-internship-tracker`.
- Deployment: `dpl_EyW9a9N6ScN4HH7qHhdLEsyVRAJe`.
- Inspector: https://vercel.com/kian-cruzs-projects/atlas-internship-tracker/EyW9a9N6ScN4HH7qHhdLEsyVRAJe
- Preview: https://atlas-internship-tracker-jc0ofq73b-kian-cruzs-projects.vercel.app
- Requested settings: Next.js, Node 22.x, Root Directory `atlas-standalone`, `npm ci`, `npm run build`.

The deployment was initially `INITIALIZING`. The inspection and protected-preview tools then returned HTTP 403: the connection lacks access to the `kian-cruzs-projects` team. The final build result and effective project settings are not verified. Reauthorize the Vercel connection for that team to enable inspection. This is a team authorization issue, not a missing plugin installation.

The preview was uploaded from source files. Automatic GitHub deployment linkage has not been configured or verified. In the existing project's Git settings, connect `Kian-Cruz/atlas-internship-tracker` and use `main` as the production branch. Do not create another project solely to connect the repository.

Configure the five production environment variables listed in DEPLOYMENT.md. Use `.env.atlas.example` for the two public Supabase values, and enter `SUPABASE_SECRET_KEY` and `DATABASE_URL` directly in Vercel's environment settings. Set `APP_URL` to the final HTTPS production origin assigned by Vercel; do not use the one-off preview URL as the production origin. Do not put the local migration URI in Vercel.

After setting the production variables and matching Supabase's authentication URLs, deploy again and complete the live acceptance checks in DEPLOYMENT.md. A functioning production website has not yet been verified.

## Current platform reference

- Supabase email-template change: https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier
