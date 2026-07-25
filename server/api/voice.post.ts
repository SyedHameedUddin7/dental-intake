import { eq } from 'drizzle-orm'
import { db } from '../db'
import { profiles } from '../db/schema'
import { voiceExtractionSchema, type VoiceResult } from '#shared/schemas/voice'
import { getDeepgram, DEEPGRAM_MODEL } from '../utils/deepgram'
import { getGroq, GROQ_MODEL } from '../utils/groq'
import { serverSupabaseUser } from '#supabase/server'

const CAN_CREATE = ['admin', 'front_desk']

const STRUCTURE_PROMPT = `You extract structured medical intake data from a patient's spoken transcript for a dental office.

From the transcript, pull ONLY what the patient actually stated. Do not invent or infer beyond what was said.

Respond with ONLY a JSON object of this exact shape:
{
  "allergies": ["..."],
  "conditions": ["..."],
  "medications": ["..."],
  "symptoms": "<the patient's reported symptoms / reason for visit as a short sentence, or empty string>"
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
  if (!CAN_CREATE.includes(profile.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  // Read the uploaded audio (multipart field "audio").
  const parts = await readMultipartFormData(event)
  const audio = parts?.find((p) => p.name === 'audio')
  if (!audio?.data?.length) {
    throw createError({ statusCode: 400, statusMessage: 'No audio uploaded' })
  }

  // Resolve clients outside the try so config errors surface clearly.
  const deepgram = getDeepgram()
  const groq = getGroq()

  let transcript: string
  try {
    const response = await deepgram.listen.v1.media.transcribeFile(audio.data, {
      model: DEEPGRAM_MODEL,
      smart_format: true,
      punctuate: true,
    })
    transcript = response.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ''
  } catch (e) {
    console.error('Deepgram transcription failed:', e)
    throw createError({ statusCode: 502, statusMessage: 'Transcription failed' })
  }

  if (!transcript.trim()) {
    // Nothing recognized — return an empty structure rather than erroring.
    return { transcript: '', fields: { allergies: [], conditions: [], medications: [], symptoms: '' } } satisfies VoiceResult
  }

  let fields
  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: STRUCTURE_PROMPT },
        { role: 'user', content: transcript },
      ],
    })
    const raw = completion.choices[0]?.message?.content ?? ''
    fields = voiceExtractionSchema.parse(JSON.parse(raw))
  } catch (e) {
    console.error('Transcript structuring failed:', e)
    // Transcription still succeeded — hand back the raw transcript so staff
    // can fill the form manually.
    return { transcript, fields: { allergies: [], conditions: [], medications: [], symptoms: '' } } satisfies VoiceResult
  }

  return { transcript, fields } satisfies VoiceResult
})
