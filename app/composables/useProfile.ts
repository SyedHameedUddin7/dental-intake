export const useProfile = () => {
  const user = useSupabaseUser()
  const profile = useState<{ id: string; role: string; fullName: string } | null>('profile', () => null)
  // An authenticated user with no profiles row (e.g. created before the
  // on_auth_user_created trigger existed). They pass auth but every role-gated
  // page bounces them, so the UI has to say so rather than loop silently.
  const missingProfile = useState<boolean>('profile-missing', () => false)
  const requestFetch = useRequestFetch()

  const fetchProfile = async () => {
    const uid = user.value?.id
    // Cache hit: same user we already loaded. Otherwise always hit the server,
    // which is the real source of auth (the session cookie), not the client user ref.
    if (uid && profile.value?.id === uid) return profile.value
    try {
      profile.value = await requestFetch('/api/me')
      missingProfile.value = false
    } catch (e) {
      console.error('fetchProfile failed:', e)
      profile.value = null
      // 404 means authenticated but unprovisioned; anything else is a transient
      // failure and must not be reported to the user as a missing account.
      missingProfile.value = (e as { statusCode?: number })?.statusCode === 404
    }
    return profile.value
  }

  // Refetch whenever the authenticated user resolves or switches.
  watch(user, () => { fetchProfile() }, { immediate: true })

  return { profile, missingProfile, fetchProfile }
}