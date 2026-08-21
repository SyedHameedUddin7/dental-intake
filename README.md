# Dental Intake & Practice Management

A HIPAA-aware dental front-office app: patient intake, a live status board, longitudinal
patient records, scheduling, consent e-signatures, insurance capture, and an audit trail —
built on Nuxt 4, Supabase, and Drizzle.

## Features

- **Patient intake** — onboarding form with Zod validation (client + server), returning-patient
  recognition (match on name + DOB, prefill last history), and an optional preferred dentist.
- **Voice intake** — record the patient; Deepgram transcribes and the fields are pre-filled for review.
- **AI medical summary** — Groq (`llama-3.3-70b`) produces a structured clinical summary with
  dental-relevant risk flags.
- **Live status board** — Supabase Realtime board (checked-in / in-progress / done), scoped per day,
  with per-dentist filtering (a dentist sees their patients + the unassigned pool).
- **Scheduling** — book future appointments, a live day view, and one-click check-in that moves a
  booking straight onto the board.
- **Recalls** — patients overdue for a follow-up (last visit > 6 months, no upcoming appointment),
  with a one-click "Book" that deep-links into scheduling.
- **Patient records** — a searchable directory and a per-patient timeline of every visit with its
  captured history, AI summary, and the assigned dentist.
- **Chart notes** — dentists record a diagnosis + notes per visit.
- **Consent forms / e-signature** — HIPAA, treatment, and financial-responsibility forms signed on a
  canvas signature pad; each record snapshots the exact wording + version signed.
- **Insurance** — capture provider, member ID, a scanned card (private storage + signed URLs), and a
  verification status (unverified / pending / verified / expired).
- **Staff management** — admins create and remove logins in-app (Supabase Admin API, server-side).
- **Audit trail** — who viewed or changed patient records, viewable by admins.

## Roles

Three roles, enforced by route middleware and in every API handler:

| Capability | Admin | Front desk | Dentist |
| --- | :---: | :---: | :---: |
| New intake | ✅ | ✅ | — |
| Status board | ✅ whole floor | ✅ whole floor | ✅ own + pool |
| Schedule / book | ✅ | ✅ | view |
| Recalls | ✅ | ✅ | — |
| Patient records / timeline | ✅ | ✅ | ✅ |
| Chart notes (write) | ✅ | — | ✅ |
| Insurance + verification | ✅ | ✅ | view |
| Consent forms (collect) | ✅ | ✅ | view |
| AI summary | ✅ | — | ✅ |
| Staff management | ✅ | — | — |
| Audit log | ✅ | — | — |

## Tech stack

- **Nuxt 4** (Vue 3, Nitro) + **Nuxt UI v4** (Tailwind v4)
- **Supabase** — Postgres, Auth, Realtime, Storage
- **Drizzle ORM** + drizzle-kit migrations
- **Zod** — shared validation (`shared/schemas`, used by client and server)
- **Groq** (LLM summary) · **Deepgram** (speech-to-text)

## Setup

**Prerequisites:** Node 20+, a Supabase project.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env` from the example and fill it in:

   ```bash
   cp .env.example .env
   ```

   | Variable | Purpose |
   | --- | --- |
   | `DATABASE_URL` | Postgres connection (server/API + migrations) |
   | `SUPABASE_URL` | Supabase project URL |
   | `SUPABASE_KEY` | Publishable (anon) key — browser client + server auth |
   | `SUPABASE_SECRET_KEY` | Secret key — server-only: staff logins, storage buckets, signed URLs |
   | `GROQ_API_KEY` | AI summary (optional `GROQ_MODEL`) |
   | `DEEPGRAM_API_KEY` | Voice transcription (optional `DEEPGRAM_MODEL`) |

3. Apply database migrations:

   ```bash
   npx drizzle-kit migrate
   ```

   Realtime for the board requires the `visits` table to be in the `supabase_realtime`
   publication with `REPLICA IDENTITY FULL` (migration `0003`).

4. Run the dev server on `http://localhost:3000`:

   ```bash
   npm run dev
   ```

Create the first admin via Supabase Auth (a `profiles` row is auto-created by a trigger; set its
`role` to `admin`). After that, admins create all other staff from **Admin → Staff** in the app.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |
| `npx drizzle-kit generate` | Generate a migration from schema changes |
| `npx drizzle-kit migrate` | Apply pending migrations |

## Project structure

```
app/
  pages/            board, schedule, patients, recalls, intake, admin, audit, login
  components/       SignaturePad
  layouts/          default (role-aware nav)
  middleware/       rbac.global.ts
  composables/      useProfile
server/
  api/              REST endpoints (auth + role checks per handler)
  db/               Drizzle schema + migrations
  utils/            groq, storage, supabaseAdmin, audit
shared/
  schemas/          Zod schemas + types shared by client and server
```

## Security notes

- The **secret key never reaches the browser** — user creation, storage uploads, and signed URLs
  all run server-side.
- Insurance cards live in a **private** Storage bucket and are served only via short-lived signed URLs.
- Consent records **snapshot the signed wording + version**, so they remain valid proof if a template
  later changes.
- The **audit trail** records record views and every write for HIPAA accountability.
