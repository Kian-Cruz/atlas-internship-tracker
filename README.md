# Atlas internship tracker

A student internship workspace using Next.js, Supabase Auth, PostgreSQL and private document storage.

The application lives in **`atlas-standalone/`**. Run npm commands from that directory and set Vercel's **Root Directory** to `atlas-standalone`.

- [Application features and local development](atlas-standalone/README.md)
- [Your configured accounts and remaining setup](atlas-standalone/docs/PROJECT_SETUP.md)
- [Deployment and live acceptance checks](atlas-standalone/docs/DEPLOYMENT.md)
- [Test results and limitations](atlas-standalone/docs/TESTING.md)

GitHub Actions runs from `.github/workflows/ci.yml` at the repository root. It installs the application's locked dependencies, then runs lint, type checks, tests and the production build. It does not require production credentials.

The Supabase schema and private storage bucket are provisioned. Vercel accepted a preview deployment; its final build status has not been verified because the connected inspection tools lack access to the hosting team. Production credentials, authentication settings and live acceptance checks remain incomplete.
