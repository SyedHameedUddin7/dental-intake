<script setup lang="ts">
import { RECALL_MONTHS, type RecallPatient } from '#shared/schemas/recall'

definePageMeta({ roles: ['admin', 'front_desk'] })

const { data: recalls } = await useFetch<RecallPatient[]>('/api/recalls', {
  headers: useRequestHeaders(['cookie']),
})

function monthsAgo(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  const months = Math.floor(days / 30)
  return months >= 12 ? `${Math.floor(months / 12)}y ${months % 12}m ago` : `${months}m ago`
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString()
}
function book(p: RecallPatient) {
  navigateTo({
    path: '/schedule',
    query: { patientId: p.id, patientName: `${p.firstName} ${p.lastName}` },
  })
}
</script>

<template>
  <div class="max-w-3xl mx-auto flex flex-col gap-4">
    <div>
      <h1 class="text-xl font-semibold text-highlighted">Recalls</h1>
      <p class="text-sm text-muted">
        Patients whose last visit was over {{ RECALL_MONTHS }} months ago with no upcoming appointment.
      </p>
    </div>

    <UCard>
      <div class="divide-y divide-default">
        <div v-for="p in recalls" :key="p.id" class="flex items-center gap-3 py-3">
          <div class="min-w-0 flex-1">
            <NuxtLink :to="`/patients/${p.id}`" class="font-medium text-highlighted hover:text-primary hover:underline">
              {{ p.firstName }} {{ p.lastName }}
            </NuxtLink>
            <p class="text-sm text-muted">
              <span v-if="p.phone">{{ p.phone }}</span>
              <span v-if="p.phone && p.email"> · </span>
              <span v-if="p.email">{{ p.email }}</span>
              <span v-if="!p.phone && !p.email" class="text-dimmed">No contact on file</span>
            </p>
          </div>
          <div class="text-right">
            <UBadge color="warning" variant="subtle" size="sm">{{ monthsAgo(p.lastVisitAt) }}</UBadge>
            <p class="text-xs text-muted mt-0.5">Last: {{ fmtDate(p.lastVisitAt) }}</p>
          </div>
          <UButton label="Book" icon="i-lucide-calendar-plus" size="xs" variant="soft" @click="book(p)" />
        </div>

        <p v-if="!recalls?.length" class="text-sm text-dimmed py-8 text-center">
          No patients are due for recall. 🎉
        </p>
      </div>
    </UCard>
  </div>
</template>
