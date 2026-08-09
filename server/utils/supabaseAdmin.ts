import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// A privileged Supabase client backed by the SECRET key. Server-only — this key
// can create/delete users and bypasses RLS, so it must never reach the browser.
let client: SupabaseClient | null = null

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL
  const secret =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !secret) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Supabase admin key not configured (set SUPABASE_SECRET_KEY)',
    })
  }
  if (!client) {
    client = createClient(url, secret, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return client
}
