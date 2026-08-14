import { z } from 'zod'

// Verification workflow: front desk captures the card (pending), confirms it's
// active with the insurer (verified), or finds it lapsed (expired).
export const INSURANCE_STATUSES = ['unverified', 'pending', 'verified', 'expired'] as const
export const insuranceStatusSchema = z.enum(INSURANCE_STATUSES)
export type InsuranceStatus = (typeof INSURANCE_STATUSES)[number]

// Insurance details captured at intake or edited on the patient record. Empty
// strings clear a text field.
export const insuranceSchema = z.object({
  insuranceProvider: z.string().trim().max(100),
  insuranceMemberId: z.string().trim().max(100),
  insuranceStatus: insuranceStatusSchema,
})
export type InsuranceInput = z.infer<typeof insuranceSchema>

// Insurance as shown on the patient record. cardUrl is a short-lived signed URL
// to the scanned card image (the underlying object lives in a private bucket).
export type PatientInsurance = {
  provider: string | null
  memberId: string | null
  status: InsuranceStatus
  hasCard: boolean
  cardUrl: string | null
}
