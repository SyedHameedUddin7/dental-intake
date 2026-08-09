<script setup lang="ts">
const user = useSupabaseUser()
const { profile, fetchProfile } = useProfile()
await fetchProfile()

const canIntake = computed(() => profile.value?.role === 'admin' || profile.value?.role === 'front_desk')

const cards = computed(() => {
  const items = [
    {
      title: 'Status board',
      description: 'Live view of checked-in, in-progress and completed visits.',
      icon: 'i-lucide-layout-dashboard',
      to: '/board',
      show: true,
    },
    {
      title: 'New intake',
      description: 'Register a patient, capture medical history, check them in.',
      icon: 'i-lucide-clipboard-plus',
      to: '/intake',
      show: canIntake.value,
    },
    {
      title: 'Admin',
      description: 'Manage the practice.',
      icon: 'i-lucide-shield',
      to: '/admin',
      show: profile.value?.role === 'admin',
    },
  ]
  return items.filter((i) => i.show)
})
</script>

<template>
  <div>
    <div class="mb-6">
      <h1 class="text-2xl font-semibold text-highlighted">Welcome back</h1>
      <p class="text-muted">{{ user?.email }}</p>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <UCard
        v-for="card in cards"
        :key="card.to"
        class="hover:ring-primary transition cursor-pointer"
        @click="navigateTo(card.to)"
      >
        <div class="flex items-start gap-3">
          <div class="rounded-lg bg-primary/10 p-2">
            <UIcon :name="card.icon" class="size-5 text-primary" />
          </div>
          <div>
            <h2 class="font-medium text-highlighted">{{ card.title }}</h2>
            <p class="text-sm text-muted mt-1">{{ card.description }}</p>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
