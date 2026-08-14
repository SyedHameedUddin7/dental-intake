import { z } from 'zod'

export const CONSENT_TYPES = ['hipaa', 'treatment', 'financial'] as const
export const consentTypeSchema = z.enum(CONSENT_TYPES)
export type ConsentType = (typeof CONSENT_TYPES)[number]

// Versioned consent templates. Bump `version` whenever the wording changes; the
// exact text is snapshotted onto each signed record so old signatures stay valid
// proof of what that patient actually agreed to.
export const CONSENT_TEMPLATES: Record<ConsentType, { title: string; version: string; body: string }> = {
  hipaa: {
    title: 'HIPAA Acknowledgment',
    version: '1.0',
    body: `I acknowledge that I have received and reviewed this practice's Notice of Privacy Practices, which describes how my protected health information may be used and disclosed for treatment, payment, and healthcare operations. I understand I may request a copy at any time and that I have the right to review the Notice before signing.`,
  },
  treatment: {
    title: 'Consent to Dental Treatment',
    version: '1.0',
    body: `I voluntarily consent to the dental examinations, diagnostic procedures (including x-rays), and treatment deemed necessary or advisable by my dentist. I understand that dentistry is not an exact science and that no guarantees have been made regarding the outcome of treatment. I have had the opportunity to ask questions and may withdraw my consent at any time.`,
  },
  financial: {
    title: 'Financial Responsibility',
    version: '1.0',
    body: `I understand that I am financially responsible for all charges for services rendered, regardless of insurance coverage. I acknowledge that insurance is a contract between me and my insurer, that any estimate of coverage is not a guarantee of payment, and that any balance not paid by my insurer is my responsibility.`,
  },
}

// Payload for signing a consent: the drawn signature as a PNG data URL.
export const signConsentSchema = z.object({
  type: consentTypeSchema,
  signatureData: z
    .string()
    .startsWith('data:image/', 'Signature must be an image')
    .max(2_000_000, 'Signature image is too large'),
})
export type SignConsentInput = z.infer<typeof signConsentSchema>

// A patient's status for one consent type, as shown on their record.
export type ConsentStatus = {
  type: ConsentType
  title: string
  currentVersion: string
  signed: null | {
    id: string
    version: string
    signedAt: string
    signedByName: string | null
    outdated: boolean // signed an older version than the current template
  }
}

// Full signed consent for viewing (snapshot text + signature image).
export type SignedConsent = {
  id: string
  type: ConsentType
  title: string
  version: string
  bodySnapshot: string
  signatureData: string
  signedAt: string
  signedByName: string | null
}
