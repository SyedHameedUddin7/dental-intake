import { getSupabaseAdmin } from './supabaseAdmin'

// Insurance cards are PII — kept in a PRIVATE bucket and only ever exposed via
// short-lived signed URLs generated server-side for authorized staff.
export const INSURANCE_BUCKET = 'insurance-cards'

export const ALLOWED_CARD_TYPES = ['image/png', 'image/jpeg', 'image/webp']
export const MAX_CARD_BYTES = 5 * 1024 * 1024 // 5 MB

// Create the bucket on first use so a fresh environment needs no manual setup.
export async function ensureInsuranceBucket() {
  const admin = getSupabaseAdmin()
  const { data } = await admin.storage.getBucket(INSURANCE_BUCKET)
  if (data) return
  await admin.storage.createBucket(INSURANCE_BUCKET, {
    public: false,
    fileSizeLimit: MAX_CARD_BYTES,
    allowedMimeTypes: ALLOWED_CARD_TYPES,
  })
}

// A time-limited URL to view a stored card image (default 1 hour).
export async function signedCardUrl(path: string, expiresIn = 3600) {
  const admin = getSupabaseAdmin()
  const { data } = await admin.storage.from(INSURANCE_BUCKET).createSignedUrl(path, expiresIn)
  return data?.signedUrl ?? null
}
