The roadmap

Plan — environment check + scope + data model + architecture doc ← we start here
Scaffold — Nuxt 3 project, repo, folder structure
Database — Supabase project, Drizzle schema, migrations, RLS policies
Auth + RBAC — three roles (admin / front desk / dentist)
Core intake — onboarding form + Zod validation
AI layer — OpenAI structured medical-history summary
Voice — Deepgram transcription → structured intake
Realtime — Supabase Realtime live status board (checked-in / in-progress / done)
CI/CD + deploy — GitHub Actions, then Vercel vs AWS (real decision; we'll weigh it then — your AWS depth could make Amplify the "hits their infra value" play)
Polish — audit logging, README with metrics, demo data, walkthrough video