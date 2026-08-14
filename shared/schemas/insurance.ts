import { z } from 'zod'

// Insurance details captured at intake or edited on the patient record. Empty
// strings clear a field.
export const insuranceSchema = z.object({
  insuranceProvider: z.string().trim().max(100),
  insuranceMemberId: z.string().trim().max(100),
})
export type InsuranceInput = z.infer<typeof insuranceSchema>

// Insurance as shown on the patient record. cardUrl is a short-lived signed URL
// to the scanned card image (the underlying object lives in a private bucket).
export type PatientInsurance = {
  provider: string | null
  memberId: string | null
  hasCard: boolean
  cardUrl: string | null
}
