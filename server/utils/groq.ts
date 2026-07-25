import Groq from 'groq-sdk'

// Lazily construct a single Groq client. Reads GROQ_API_KEY / GROQ_MODEL from
// the environment (same convention as DATABASE_URL). The API is OpenAI-shaped,
// so pointing this at another provider later is a config change, not a rewrite.
let client: Groq | null = null

export function getGroq() {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    throw createError({ statusCode: 500, statusMessage: 'GROQ_API_KEY is not set' })
  }
  if (!client) client = new Groq({ apiKey })
  return client
}

export const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
