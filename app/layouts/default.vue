<script setup lang="ts">
const user = useSupabaseUser()
const supabase = useSupabaseClient()
const { profile } = useProfile()
const route = useRoute()

const role = computed(() => profile.value?.role ?? null)
const canIntake = computed(() => role.value === 'admin' || role.value === 'front_desk')
const isAdmin = computed(() => role.value === 'admin')

const links = computed(() => {
  const items = [
    { label: 'Board', to: '/board', icon: 'i-lucide-layout-dashboard' },
    { label: 'Patients', to: '/patients', icon: 'i-lucide-users' },
  ]
  if (canIntake.value) items.unshift({ label: 'New intake', to: '/intake', icon: 'i-lucide-clipboard-plus' })
  if (isAdmin.value) items.push({ label: 'Admin', to: '/admin', icon: 'i-lucide-shield' })
  return items
})

const roleColor: Record<string, 'primary' | 'success' | 'info' | 'neutral'> = {
  admin: 'primary',
  front_desk: 'info',
  dentist: 'success',
}

async function signOut() {
  await supabase.auth.signOut()
  navigateTo('/login')
}
</script>

<template>
  <div class="min-h-screen bg-muted/30">
    <header class="border-b border-default bg-default/80 backdrop-blur sticky top-0 z-10">
      <div class="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6">
        <NuxtLink to="/" class="flex items-center gap-2 font-semibold text-highlighted">
          <UIcon name="i-lucide-activity" class="size-5 text-primary" />
          Dental Intake
        </NuxtLink>

        <nav class="flex items-center gap-1">
          <UButton
            v-for="link in links"
            :key="link.to"
            :to="link.to"
            :icon="link.icon"
            :label="link.label"
            :color="route.path === link.to ? 'primary' : 'neutral'"
            :variant="route.path === link.to ? 'soft' : 'ghost'"
            size="sm"
          />
        </nav>

        <div v-if="user" class="ml-auto flex items-center gap-3">
          <UBadge
            v-if="role"
            :color="roleColor[role] ?? 'neutral'"
            variant="subtle"
            class="capitalize"
          >
            {{ role.replace('_', ' ') }}
          </UBadge>
          <span class="text-sm text-muted hidden sm:inline">{{ user.email }}</span>
          <UButton
            icon="i-lucide-log-out"
            color="neutral"
            variant="ghost"
            size="sm"
            aria-label="Sign out"
            @click="signOut"
          />
        </div>
      </div>
    </header>

    <main class="max-w-6xl mx-auto px-4 py-6">
      <slot />
    </main>
  </div>
</template>
