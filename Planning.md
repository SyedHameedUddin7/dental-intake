# Roadmap & status

## Phase 1 — foundation

- [x] **Plan** — environment check + scope + data model + architecture
- [x] **Scaffold** — Nuxt project, repo, folder structure
- [x] **Database** — Supabase project, Drizzle schema, migrations, RLS policies
- [x] **Auth + RBAC** — three roles (admin / front desk / dentist)
- [x] **Core intake** — onboarding form + Zod validation
- [x] **AI layer** — Groq structured medical-history summary
- [x] **Voice** — Deepgram transcription → structured intake
- [x] **Realtime** — Supabase Realtime live status board (checked-in / in-progress / done)
- [ ] **CI/CD + deploy** — GitHub Actions, then Vercel vs AWS (Amplify) — *next*
- [~] **Polish** — audit logging ✅, README ✅; demo data + walkthrough video pending

## Phase 2 — practice-management depth

- [x] **UI layer** — Nuxt UI, role-aware layout, styled surfaces
- [x] **Per-dentist board filtering** — own patients + unassigned pool; claim-on-start
- [x] **Preferred dentist at intake** — assign the visit up front, or leave in the pool
- [x] **Returning-patient recognition** — match on name + DOB, prefill last history
- [x] **Patient timeline** — searchable directory + per-patient longitudinal visit history
- [x] **Chart notes** — dentist diagnosis + notes per visit
- [x] **Insurance capture** — provider, member ID, scanned card (private storage + signed URLs)
- [x] **Insurance verification status** — unverified / pending / verified / expired
- [x] **Audit trail** — who viewed/changed records; admin viewer + per-patient access log
- [x] **Consent forms / e-signature** — HIPAA, treatment, financial; versioned + signature snapshot
- [x] **Scheduling** — appointment booking + live day view; check-in flows to the board
- [x] **Recall / follow-up** — overdue patients (last visit > 6mo, no upcoming appt) → one-click book
- [x] **Staff management** — admins create/remove logins in-app

## Migrations

`0000` schema · `0001` auth FK + profile trigger · `0002` RLS policies · `0003` visits realtime ·
`0004` insurance fields · `0005` insurance status · `0006` consents

## Next

CI/CD + deploy — GitHub Actions (lint/build/typecheck), then hosting (Vercel vs AWS Amplify),
with migrations applied on deploy and the runtime env (`SUPABASE_SECRET_KEY`, Groq, Deepgram) set.
