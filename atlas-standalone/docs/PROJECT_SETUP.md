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

## GitHub upload

Destination: https://github.com/Kian-Cruz/atlas-internship-tracker

The connected GitHub integration still returned HTTP 403 on writes after the reported permission update. No source files were uploaded through it. To publish using your own local Git credentials, download the latest ZIP, extract it to a **new folder**, open the inner `atlas-standalone` folder in VS Code and run:

```powershell
git init -b main
git remote add origin https://github.com/Kian-Cruz/atlas-internship-tracker.git
git fetch origin main
git reset --mixed origin/main
git add .
git commit -m "Add standalone Atlas internship tracker"
git push -u origin main
```

These commands are for the freshly extracted folder. The mixed reset connects it to the existing initial README commit while preserving the extracted working files. The push does not force-overwrite remote history. Git may ask you to sign in through your own credential manager. Review the staged file list before committing if you have added personal files or credentials.

## Hosting

Vercel is installed in the conversation, but no live Vercel operations were exposed to the session. No Atlas Vercel project or deployment has been created by this work.

After the source is uploaded, import the repository at https://vercel.com/new, select Next.js, and configure the five production environment variables listed in DEPLOYMENT.md. Use `.env.atlas.example` for the two public Supabase values, and enter private values directly in Vercel's environment settings. Set `APP_URL` to the final HTTPS origin. Do not put the local migration URI in Vercel.

Complete the live acceptance checks in DEPLOYMENT.md before inviting students. The website is not live yet.

## Current platform reference

- Supabase email-template change: https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier
