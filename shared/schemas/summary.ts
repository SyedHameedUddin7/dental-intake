import { z } from 'zod'

// Shape of the AI-generated medical-history summary. Used to validate the
// model's JSON output on the server and to type it on the client.
export const summaryStructuredSchema = z.object({
  chiefComplaint: z.string(),
  allergies: z.array(z.string()),
  medications: z.array(z.string()),
  conditions: z.array(z.string()),
  // Dental-relevant risks/contraindications inferred from the history
  // (e.g. anticoagulant bleeding risk, antibiotic allergy).
  riskFlags: z.array(z.string()),
  recommendations: z.array(z.string()),
})

export const summaryResultSchema = z.object({
  summaryText: z.string().min(1),
  structured: summaryStructuredSchema,
})

export type SummaryStructured = z.infer<typeof summaryStructuredSchema>
export type SummaryResult = z.infer<typeof summaryResultSchema>
