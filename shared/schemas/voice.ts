import { z } from 'zod'

// Structured medical fields extracted from a spoken intake transcript.
// Mirrors the medical-history portion of the intake form so results can
// prefill it directly.
export const voiceExtractionSchema = z.object({
  allergies: z.array(z.string()),
  conditions: z.array(z.string()),
  medications: z.array(z.string()),
  symptoms: z.string(),
})

export const voiceResultSchema = z.object({
  transcript: z.string(),
  fields: voiceExtractionSchema,
})

export type VoiceExtraction = z.infer<typeof voiceExtractionSchema>
export type VoiceResult = z.infer<typeof voiceResultSchema>
