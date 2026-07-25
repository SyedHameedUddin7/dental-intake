export const useProfile = () => {
  const user = useSupabaseUser()
  const profile = useState<{ id: string; role: string; fullName: string } | null>('profile', () => null)
  const requestFetch = useRequestFetch()

  const fetchProfile = async () => {
    const uid = user.value?.id
    // Cache hit: same user we already loaded. Otherwise always hit the server,
    // which is the real source of auth (the session cookie), not the client user ref.
    if (uid && profile.value?.id === uid) return profile.value
    try {
      profile.value = await requestFetch('/api/me')
    } catch (e) {
      console.error('fetchProfile failed:', e)
      profile.value = null
    }
    return profile.value
  }

  // Refetch whenever the authenticated user resolves or switches.
  watch(user, () => { fetchProfile() }, { immediate: true })

  return { profile, fetchProfile }
}