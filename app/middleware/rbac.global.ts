export default defineNuxtRouteMiddleware(async (to) => {
  const roles = to.meta.roles as string[] | undefined
  if (!roles || roles.length === 0) return

  const user = useSupabaseUser()
  if (!user.value) return navigateTo('/login')

  const { fetchProfile } = useProfile()
  const profile = await fetchProfile()

  if (!profile || !roles.includes(profile.role)) {
    return navigateTo('/')
  }
})