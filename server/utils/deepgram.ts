import { DeepgramClient } from '@deepgram/sdk'

// Lazily construct a single Deepgram client. Reads DEEPGRAM_API_KEY from the
// environment (same convention as DATABASE_URL / GROQ_API_KEY).
let client: DeepgramClient | null = null

export function getDeepgram() {
  const apiKey = process.env.DEEPGRAM_API_KEY
  if (!apiKey) {
    throw createError({ statusCode: 500, statusMessage: 'DEEPGRAM_API_KEY is not set' })
  }
  if (!client) client = new DeepgramClient({ apiKey })
  return client
}

// Default STT model; override with DEEPGRAM_MODEL if needed.
export const DEEPGRAM_MODEL = process.env.DEEPGRAM_MODEL || 'nova-3'
