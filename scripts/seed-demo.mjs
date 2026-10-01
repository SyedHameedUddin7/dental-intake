// Demo data for manual testing.
//
//   node scripts/seed-demo.mjs          seed (replaces any previous seed)
//   node scripts/seed-demo.mjs --clear  remove the seed, leave everything else
//
// Only rows this script created are ever touched: a patient is matched on the
// exact first name + last name + date of birth in SEED_PATIENTS below, so real
// records are never caught by a re-run or a clear. Visits, intake submissions,
// summaries and consents are removed by the patient cascade.
//
// Writes straight to Postgres rather than through the API, so it can backdate
// visits — which is the only way to produce a recall candidate.

import 'dotenv/config'
import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL, { prepare: false })

const DAY = 86_400_000
const now = new Date()

/** A date N days from today at a given local hour:minute. */
function at(dayOffset, hour, minute = 0) {
  const d = new Date(now.getTime() + dayOffset * DAY)
  d.setHours(hour, minute, 0, 0)
  return d
}
/** Roughly N months ago, for backdating a visit history. */
function monthsAgo(n, hour = 10) {
  const d = new Date(now)
  d.setMonth(d.getMonth() - n)
  d.setHours(hour, 0, 0, 0)
  return d
}
/** The next weekday at or after a day offset, so demo bookings never land on a weekend. */
function nextWeekday(offset, hour, minute = 0) {
  const d = at(offset, hour, minute)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  return d
}

// A drawn-looking signature, so a signed consent renders as something real.
const SIGNATURE =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="110" viewBox="0 0 320 110">' +
      '<path d="M18 78 C 40 20, 62 20, 70 60 S 92 96, 104 58 C 112 30, 128 34, 134 62 ' +
      'C 140 88, 156 86, 168 60 C 180 34, 196 38, 202 66 C 208 92, 228 86, 246 52 ' +
      'C 258 30, 276 30, 292 44" fill="none" stroke="#1b2a4a" stroke-width="3.5" ' +
      'stroke-linecap="round" stroke-linejoin="round"/></svg>',
  ).toString('base64')

const HIPAA_BODY =
  "I acknowledge that I have received and reviewed this practice's Notice of Privacy Practices, " +
  'which describes how my protected health information may be used and disclosed for treatment, ' +
  'payment, and healthcare operations. I understand I may request a copy at any time and that I ' +
  'have the right to review the Notice before signing.'
const TREATMENT_BODY =
  'I voluntarily consent to the dental examinations, diagnostic procedures (including x-rays), and ' +
  'treatment deemed necessary or advisable by my dentist. I understand that dentistry is not an ' +
  'exact science and that no guarantees have been made regarding the outcome of treatment. I have ' +
  'had the opportunity to ask questions and may withdraw my consent at any time.'

// Every patient the seed owns. Identity here is the delete key — keep it stable.
const SEED_PATIENTS = [
  // --- Recalls: last visit well past six months, nothing booked ahead ---
  { first: 'Maya',    last: 'Fernandes',    dob: '1987-03-14', phone: '617-555-0142', email: 'maya.fernandes@example.com', ins: ['Delta Dental', 'DD4417829', 'verified'] },
  { first: 'Owen',    last: 'Brightwater',  dob: '1979-11-02', phone: '617-555-0188', email: 'owen.b@example.com',         ins: ['Cigna', 'CG7730114', 'expired'] },
  // No contact details at all — exercises the "No contact on file" branch.
  { first: 'Priya',   last: 'Raghunathan',  dob: '1994-06-21', phone: null,           email: null,                        ins: [null, null, 'unverified'] },
  // --- On the board today ---
  { first: 'Tobias',  last: 'Lindqvist',    dob: '2001-01-09', phone: '617-555-0119', email: 'tobias.l@example.com',      ins: ['Aetna', 'AE2209471', 'pending'] },
  { first: 'Grace',   last: 'Abioye',       dob: '1990-09-30', phone: '617-555-0167', email: 'grace.abioye@example.com',  ins: ['Guardian', 'GU8810266', 'verified'] },
  { first: 'Desmond', last: 'Okafor',       dob: '1968-04-17', phone: '617-555-0103', email: 'd.okafor@example.com',      ins: ['MetLife', 'ML5529038', 'pending'] },
  { first: 'Rosa',    last: 'Delgado',      dob: '1991-08-08', phone: '617-555-0115', email: 'rosa.delgado@example.com',  ins: ['Guardian', 'GU2244731', 'verified'] },
  // --- Expected later today ---
  { first: 'Noor',    last: 'Haddad',       dob: '1996-12-05', phone: '617-555-0151', email: 'noor.haddad@example.com',   ins: ['Delta Dental', 'DD9902517', 'verified'] },
  { first: 'Ethan',   last: 'Caldwell',     dob: '1985-07-23', phone: '617-555-0174', email: 'ethan.c@example.com',       ins: [null, null, 'unverified'] },
  // --- Longitudinal history + a future booking ---
  { first: 'Camille', last: 'Beaulieu',     dob: '1973-02-28', phone: '617-555-0136', email: 'camille.b@example.com',     ins: ['Principal', 'PR3341980', 'verified'] },
  // Overdue, but booked ahead — must NOT show up under Recalls.
  { first: 'Henrik',  last: 'Sorensen',     dob: '1982-05-19', phone: '617-555-0192', email: 'henrik.s@example.com',      ins: ['Aetna', 'AE6618204', 'unverified'] },
  // Never been seen: empty timeline, and something to book an appointment for.
  { first: 'Arjun',   last: 'Mehta',        dob: '2005-10-12', phone: '617-555-0128', email: 'arjun.mehta@example.com',   ins: [null, null, 'unverified'] },
]

async function clearSeed() {
  let removed = 0
  for (const p of SEED_PATIENTS) {
    const gone = await sql`
      delete from public.patients
      where first_name = ${p.first} and last_name = ${p.last} and date_of_birth = ${p.dob}
      returning id`
    removed += gone.length
  }
  return removed
}

async function main() {
  const clearOnly = process.argv.includes('--clear')

  const removed = await clearSeed()
  if (clearOnly) {
    console.log(`Removed ${removed} seeded patient(s) and everything attached to them.`)
    return
  }
  if (removed) console.log(`Replaced ${removed} patient(s) from a previous seed.`)

  // Staff to attribute the data to. Falls back to whoever exists.
  const staff = await sql`select id, role, full_name from public.profiles`
  const byRole = (r) => staff.filter((s) => s.role === r)
  const dentists = byRole('dentist')
  const creator = byRole('front_desk')[0] ?? byRole('admin')[0] ?? staff[0]
  if (!dentists.length || !creator) {
    throw new Error('Seed needs at least one dentist and one front-desk/admin profile. Create staff first.')
  }
  const riya = dentists.find((d) => /riya/i.test(d.full_name)) ?? dentists[0]
  const sam = dentists.find((d) => d.id !== riya.id) ?? riya

  // --- patients ---
  const id = {}
  for (const p of SEED_PATIENTS) {
    const [row] = await sql`
      insert into public.patients
        (first_name, last_name, date_of_birth, phone, email,
         insurance_provider, insurance_member_id, insurance_status, created_by)
      values (${p.first}, ${p.last}, ${p.dob}, ${p.phone}, ${p.email},
              ${p.ins[0]}, ${p.ins[1]}, ${p.ins[2]}, ${creator.id})
      returning id`
    id[`${p.first} ${p.last}`] = row.id
  }

  // --- visits ---
  // [patient, status, checkedInAt, scheduledAt, durationMinutes, providerId, reason]
  const visits = [
    // Recall candidates: one old completed visit each, nothing upcoming.
    ['Maya Fernandes',   'done', monthsAgo(11), null, 30, riya.id, 'Routine cleaning'],
    ['Owen Brightwater', 'done', monthsAgo(8),  null, 30, sam.id,  'Chipped incisor'],
    ['Priya Raghunathan','done', monthsAgo(14), null, 45, riya.id, 'Wisdom tooth review'],

    // Already in the building today.
    ['Tobias Lindqvist', 'checked_in',  at(0, 8, 50), null, 30, riya.id, 'Sensitivity to cold'],
    ['Grace Abioye',     'checked_in',  at(0, 9, 20), null, 30, null,    'Walk-in, aching molar'],
    ['Desmond Okafor',   'done',        at(0, 8, 15), null, 60, sam.id,  'Crown fitting'],
    ['Rosa Delgado',     'in_progress', at(0, 9, 40), null, 60, sam.id,  'Root canal, first session'],

    // Expected later today — these fill the board's Expected column.
    ['Noor Haddad',      'scheduled', null, at(0, 14, 0),  30, riya.id, '6-month cleaning'],
    ['Ethan Caldwell',   'scheduled', null, at(0, 15, 30), 45, null,    'New patient consultation'],

    // Longitudinal history, plus a booking a few days out.
    ['Camille Beaulieu', 'done', monthsAgo(9),  null, 30, sam.id,  'Scale and polish'],
    ['Camille Beaulieu', 'done', monthsAgo(3),  null, 45, sam.id,  'Filling, lower left'],
    ['Camille Beaulieu', 'scheduled', null, nextWeekday(5, 10, 0), 30, sam.id, 'Follow-up on filling'],

    // Overdue but booked ahead: proves Recalls excludes anyone with an upcoming visit.
    ['Henrik Sorensen',  'done', monthsAgo(9), null, 30, riya.id, 'Annual check-up'],
    ['Henrik Sorensen',  'scheduled', null, nextWeekday(6, 11, 30), 30, riya.id, 'Overdue check-up'],
  ]

  const visitId = []
  for (const [name, status, checkedInAt, scheduledAt, mins, provider, reason] of visits) {
    const [row] = await sql`
      insert into public.visits
        (patient_id, provider_id, status, reason, scheduled_at, duration_minutes, checked_in_at)
      values (${id[name]}, ${provider}, ${status}, ${reason}, ${scheduledAt}, ${mins}, ${checkedInAt})
      returning id`
    visitId.push({ name, status, id: row.id })
  }
  // nth visit for a patient, in insertion order. Camille has several, and her
// timeline is only interesting if each one carries its own history.
const visitFor = (name, n = 0) => visitId.filter((v) => v.name === name)[n]?.id ?? null

  // --- intake submissions: the medical history shown on each visit ---
  // [patient, visitIndex, allergies, conditions, medications, symptoms]
  const intakes = [
    ['Maya Fernandes',   0, ['Penicillin'], ['Asthma'], ['Salbutamol'], 'Mild gum sensitivity when brushing.'],
    ['Owen Brightwater', 0, [], ['Hypertension'], ['Lisinopril'], 'Chipped a front tooth on a fork.'],
    ['Priya Raghunathan',0, ['Latex'], [], [], 'Dull ache at the back of the lower jaw.'],
    ['Tobias Lindqvist', 0, [], [], [], 'Sharp pain with cold drinks, upper right.'],
    ['Grace Abioye',     0, ['Ibuprofen'], [], [], 'Constant ache in a lower molar since the weekend.'],
    ['Rosa Delgado',     0, [], [], ['Sertraline'], 'Throbbing upper molar, worse at night.'],
    ['Desmond Okafor',   0, [], ['Type 2 diabetes', 'Atrial fibrillation'], ['Metformin', 'Warfarin'], 'Here for the permanent crown.'],
    // Both of Camille's completed visits, so her history shows what changed between them.
    ['Camille Beaulieu', 0, [], ['Hypothyroidism'], ['Levothyroxine'], 'Routine clean, no complaints.'],
    ['Camille Beaulieu', 1, [], ['Hypothyroidism'], ['Levothyroxine', 'Amoxicillin'], 'Ache in the lower left when chewing.'],
    ['Henrik Sorensen',  0, [], [], [], 'No complaints, routine check.'],
  ]
  const intakeId = {}
  for (const [name, visitIdx, allergies, conditions, meds, symptoms] of intakes) {
    const [row] = await sql`
      insert into public.intake_submissions
        (patient_id, visit_id, source, allergies, conditions, medications, symptoms)
      values (${id[name]}, ${visitFor(name, visitIdx)}, 'form',
              ${JSON.stringify(allergies)}::jsonb, ${JSON.stringify(conditions)}::jsonb,
              ${JSON.stringify(meds)}::jsonb, ${symptoms})
      returning id`
    intakeId[name] = row.id
  }

  // --- an AI summary with real risk flags, on the medically interesting patient ---
  const desmondStructured = {
    chiefComplaint: 'Attending for fitting of a permanent crown.',
    allergies: [],
    medications: ['Metformin', 'Warfarin'],
    conditions: ['Type 2 diabetes', 'Atrial fibrillation'],
    riskFlags: [
      'Anticoagulant therapy (warfarin) — bleeding risk with extraction or deep scaling',
      'Diabetes — impaired healing and raised periodontal risk',
    ],
    recommendations: [
      'Confirm a recent INR before any invasive procedure',
      'Book morning appointments and check the patient has eaten',
      'Shorter recall interval for periodontal monitoring',
    ],
  }
  await sql`
    insert into public.ai_summaries (intake_id, summary_text, structured, model, created_by)
    values (
      ${intakeId['Desmond Okafor']},
      ${'58-year-old attending for a permanent crown fitting. Managed type 2 diabetes on metformin and atrial fibrillation on warfarin. The anticoagulant is the main dental consideration: any procedure that draws blood needs a current INR and local haemostatic measures. Diabetes raises periodontal risk and slows healing, so a shorter recall interval is appropriate. No known drug allergies.'},
      ${JSON.stringify(desmondStructured)}::jsonb,
      ${'llama-3.3-70b-versatile'},
      ${creator.id}
    )`

  // --- chart notes on completed visits ---
  const notes = [
    ['Desmond Okafor',   'Permanent crown fitted, upper right first molar', 'Cemented and occlusion checked. Patient comfortable. Review in six months; INR check before any future extraction.'],
    ['Camille Beaulieu', 'Composite filling, lower left second premolar',   'Caries removed, composite placed and polished. No sensitivity on testing. Review at next cleaning.'],
    ['Maya Fernandes',   'Generalised mild gingivitis',                     'Scaled and polished. Oral hygiene advice given, interdental brushing demonstrated.'],
  ]
  for (const [name, diagnosis, comments] of notes) {
    const target = visitId.filter((v) => v.name === name && v.status === 'done').pop()
    if (target) {
      await sql`update public.visits set diagnosis = ${diagnosis}, comments = ${comments} where id = ${target.id}`
    }
  }

  // --- consents: signed, outdated and pending all represented ---
  const consents = [
    ['Maya Fernandes',   'hipaa',     '1.0', HIPAA_BODY,     monthsAgo(11)],
    ['Maya Fernandes',   'treatment', '1.0', TREATMENT_BODY, monthsAgo(11)],
    ['Desmond Okafor',   'hipaa',     '1.0', HIPAA_BODY,     at(0, 8, 20)],
    ['Desmond Okafor',   'treatment', '1.0', TREATMENT_BODY, at(0, 8, 21)],
    // Signed against an older template — the record shows "Outdated" and offers Re-sign.
    ['Camille Beaulieu', 'hipaa',     '0.9', HIPAA_BODY,     monthsAgo(9)],
  ]
  for (const [name, type, version, body, signedAt] of consents) {
    await sql`
      insert into public.consents
        (patient_id, type, version, body_snapshot, signature_data, signed_by, signed_at)
      values (${id[name]}, ${type}, ${version}, ${body}, ${SIGNATURE}, ${creator.id}, ${signedAt})`
  }

  console.log(`Seeded ${SEED_PATIENTS.length} patients, ${visits.length} visits, ${intakes.length} intakes, 1 AI summary, ${consents.length} consents.`)
  console.log(`Dentists used: ${riya.full_name} and ${sam.full_name}.`)
}

main()
  .catch((e) => { console.error(e.message); process.exitCode = 1 })
  .finally(() => sql.end({ timeout: 5 }))
