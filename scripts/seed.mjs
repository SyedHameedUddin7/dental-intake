/**
 * Demo seed: creates login accounts + a couple of checked-in patients so the
 * status board isn't empty when you start a walkthrough.
 *
 *   node scripts/seed.mjs
 *
 * Requires in .env:
 *   SUPABASE_URL          - your project URL (already set)
 *   DATABASE_URL          - postgres connection string (already set)
 *   SUPABASE_SECRET_KEY   - the *secret* key (sb_secret_...), NOT the publishable
 *                           one. Supabase dashboard -> Project Settings -> API keys.
 *
 * Safe to run more than once: accounts are reused if they already exist, and the
 * sample patients (tagged with @seed.demo) are cleared and re-created each run.
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import postgres from 'postgres'

const { SUPABASE_URL, DATABASE_URL } = process.env
const SECRET =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !DATABASE_URL) {
  console.error('✗ SUPABASE_URL and DATABASE_URL must be set in .env')
  process.exit(1)
}
if (!SECRET) {
  console.error(
    '✗ Missing the Supabase secret key. Add SUPABASE_SECRET_KEY (sb_secret_...) to .env.\n' +
      '  Find it in: Supabase dashboard -> Project Settings -> API keys -> Secret key.\n' +
      '  (The publishable key already in SUPABASE_KEY cannot create users.)',
  )
  process.exit(1)
}

const PASSWORD = 'Password123!'

const ACCOUNTS = [
  { email: 'admin@clinic.test', role: 'admin', fullName: 'Alex Admin' },
  { email: 'frontdesk@clinic.test', role: 'front_desk', fullName: 'Fran Desk' },
  { email: 'dentist@clinic.test', role: 'dentist', fullName: 'Dr. Riya Shah' },
]

// Sample patients checked in for today's board. Emails tagged @seed.demo so
// re-running the script can clean them up without touching real data.
const PATIENTS = [
  { firstName: 'Maria', lastName: 'Lopez', dob: '1988-04-12', phone: '555-0101', email: 'maria@seed.demo', reason: 'Toothache, upper right molar' },
  { firstName: 'James', lastName: 'Chen', dob: '1975-11-30', phone: '555-0102', email: 'james@seed.demo', reason: 'Routine cleaning + checkup' },
]

const admin = createClient(SUPABASE_URL, SECRET, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const sql = postgres(DATABASE_URL, { prepare: false })

async function findUserByEmail(email) {
  // listUsers is paginated; a demo project fits well within the first page.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (error) throw error
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null
}

async function ensureAccount({ email, role, fullName }) {
  let user = await findUserByEmail(email)
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })
    if (error) throw error
    user = data.user
    console.log(`  + created ${email}`)
  } else {
    console.log(`  = reused  ${email}`)
  }

  // The on_auth_user_created trigger inserts the profile (role defaults to
  // front_desk); set the real role + name here.
  await sql`
    update profiles set role = ${role}, full_name = ${fullName}, updated_at = now()
    where id = ${user.id}
  `
  return user
}

async function main() {
  console.log('Seeding demo accounts...')
  const created = {}
  for (const acct of ACCOUNTS) {
    const user = await ensureAccount(acct)
    created[acct.role] = user.id
  }

  console.log('Seeding sample checked-in patients...')
  await sql`delete from patients where email like '%@seed.demo'`
  const createdBy = created.admin ?? created.front_desk ?? null
  for (const p of PATIENTS) {
    const [patient] = await sql`
      insert into patients (first_name, last_name, date_of_birth, phone, email, created_by)
      values (${p.firstName}, ${p.lastName}, ${p.dob}, ${p.phone}, ${p.email}, ${createdBy})
      returning id
    `
    await sql`
      insert into visits (patient_id, status, reason, checked_in_at)
      values (${patient.id}, 'checked_in', ${p.reason}, now())
    `
    console.log(`  + ${p.firstName} ${p.lastName} (checked in)`)
  }

  console.log('\nDone. Demo logins (password for all: %s):', PASSWORD)
  for (const a of ACCOUNTS) console.log(`  ${a.role.padEnd(11)} ${a.email}`)
}

main()
  .catch((e) => {
    console.error('\n✗ Seed failed:', e.message ?? e)
    process.exitCode = 1
  })
  .finally(() => sql.end())
