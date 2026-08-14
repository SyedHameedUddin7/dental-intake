<script setup lang="ts">
import type { PatientListItem } from '#shared/schemas/patient'
import type { InsuranceStatus } from '#shared/schemas/insurance'

definePageMeta({ roles: ['admin', 'front_desk', 'dentist'] })

const INS_STATUS: Record<InsuranceStatus, { label: string; color: 'neutral' | 'warning' | 'success' | 'error' }> = {
  unverified: { label: 'Unverified', color: 'neutral' },
  pending: { label: 'Pending', color: 'warning' },
  verified: { label: 'Verified', color: 'success' },
  expired: { label: 'Expired', color: 'error' },
}

const search = ref('')
const q = ref('')
let debounce: ReturnType<typeof setTimeout> | undefined
watch(search, (val) => {
  clearTimeout(debounce)
  debounce = setTimeout(() => (q.value = val.trim()), 300)
})

const { data: patients } = await useFetch<PatientListItem[]>('/api/patients', {
  query: { q },
  headers: useRequestHeaders(['cookie']),
})

function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString() : '—'
}
function initials(p: PatientListItem) {
  return `${p.firstName[0] ?? ''}${p.lastName[0] ?? ''}`.toUpperCase()
}
</script>

<template>
  <div class="max-w-3xl mx-auto flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-3">
      <div>
        <h1 class="text-xl font-semibold text-highlighted">Patients</h1>
        <p class="text-sm text-muted">Browse patient records and visit history.</p>
      </div>
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Search by name"
        class="ml-auto w-full sm:w-64"
      />
    </div>

    <UCard>
      <div class="divide-y divide-default">
        <NuxtLink
          v-for="p in patients"
          :key="p.id"
          :to="`/patients/${p.id}`"
          class="flex items-center gap-3 py-3 hover:bg-elevated/50 -mx-4 px-4 transition"
        >
          <UAvatar :text="initials(p)" size="sm" color="primary" />
          <div class="min-w-0">
            <p class="font-medium text-highlighted truncate">{{ p.firstName }} {{ p.lastName }}</p>
            <p class="text-sm text-muted">DOB {{ fmtDate(p.dateOfBirth) }}</p>
          </div>
          <UBadge
            :color="INS_STATUS[p.insuranceStatus].color"
            variant="subtle"
            size="sm"
            class="ml-auto hidden sm:inline-flex"
          >
            {{ INS_STATUS[p.insuranceStatus].label }}
          </UBadge>
          <div class="text-right sm:ml-0 ml-auto">
            <p class="text-sm text-highlighted">{{ p.visitCount }} visit{{ p.visitCount === 1 ? '' : 's' }}</p>
            <p class="text-xs text-muted">Last: {{ fmtDate(p.lastVisitAt) }}</p>
          </div>
          <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed" />
        </NuxtLink>

        <p v-if="!patients?.length" class="text-sm text-dimmed py-6 text-center">
          {{ q ? 'No patients match your search.' : 'No patients yet.' }}
        </p>
      </div>
    </UCard>
  </div>
</template>
