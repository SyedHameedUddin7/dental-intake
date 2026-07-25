import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { intakeSubmissions, patients, aiSummaries, profiles } from '../db/schema'
import { summaryResultSchema } from '#shared/schemas/summary'
import { getGroq, GROQ_MODEL } from '../utils/groq'
import { serverSupabaseUser } from '#supabase/server'

const CAN_SUMMARIZE = ['admin', 'dentist']

const SYSTEM_PROMPT = `You are a clinical assistant for a dental practice. Given a patient's intake data (allergies, medical conditions, current medications, reported symptoms, and date of birth), write a concise medical-history summary that helps a dentist treat safely.

Rules:
- Use ONLY the information provided. Never invent diagnoses, medications, or history.
- Highlight risks that matter for dental care: bleeding risk from anticoagulants, antibiotic/anesthetic allergies, conditions affecting treatment or healing (e.g. diabetes, hypertension, pregnancy, immunosuppression).
- Be brief and clinical. If a field is empty, say "none reported" rather than guessing.

Respond with ONLY a JSON object of this exact shape:
{
  "summaryText": "<2-4 sentence prose summary for the dentist>",
  "structured": {
    "chiefComplaint": "<short phrase from the reported symptoms, or 'none reported'>",
    "allergies": ["..."],
    "medications": ["..."],
    "conditions": ["..."],
    "riskFlags": ["<dental-relevant risk>", "..."],
    "recommendations": ["<actionable precaution for the dentist>", "..."]
  }
}
Arrays may be empty. Do not include any text outside the JSON.`

export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  const userId = claims?.sub
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const [profile] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1)
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Profile not found' })
  if (!CAN_SUMMARIZE.includes(profile.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const parsedBody = z.object({ intakeId: z.uuid() }).safeParse(await readBody(event))
  if (!parsedBody.success) {
    throw createError({ statusCode: 400, statusMessage: 'Valid intakeId is required' })
  }

  const [row] = await db
    .select({ intake: intakeSubmissions, patient: patients })
    .from(intakeSubmissions)
    .innerJoin(patients, eq(intakeSubmissions.patientId, patients.id))
    .where(eq(intakeSubmissions.id, parsedBody.data.intakeId))
    .limit(1)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Intake not found' })

  // Send only clinically relevant fields — omit name/contact to limit PII
  // sent to the model.
  const context = {
    dateOfBirth: row.patient.dateOfBirth,
    allergies: row.intake.allergies,
    conditions: row.intake.conditions,
    medications: row.intake.medications,
    symptoms: row.intake.symptoms ?? '',
  }

  // Resolve the client outside the try so a config error (missing key) surfaces
  // clearly instead of being masked as a generic generation failure.
  const groq = getGroq()

  let result
  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(context) },
      ],
    })
    const raw = completion.choices[0]?.message?.content ?? ''
    result = summaryResultSchema.parse(JSON.parse(raw))
  } catch (e) {
    console.error('AI summary generation failed:', e)
    throw createError({ statusCode: 502, statusMessage: 'AI summary generation failed' })
  }

  const [saved] = await db
    .insert(aiSummaries)
    .values({
      intakeId: parsedBody.data.intakeId,
      summaryText: result.summaryText,
      structured: result.structured,
      model: GROQ_MODEL,
      createdBy: userId,
    })
    .returning({
      id: aiSummaries.id,
      summaryText: aiSummaries.summaryText,
      structured: aiSummaries.structured,
      createdAt: aiSummaries.createdAt,
    })

  setResponseStatus(event, 201)
  return { ...saved, model: GROQ_MODEL }
})
