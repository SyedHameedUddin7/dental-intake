<script setup lang="ts">
import type { PatientDetail } from '#shared/schemas/patient'

definePageMeta({ roles: ['admin', 'front_desk', 'dentist'] })

const route = useRoute()
const { data: patient } = await useFetch<PatientDetail>(`/api/patients/${route.params.id}`, {
  headers: useRequestHeaders(['cookie']),
})

const statusMeta: Record<string, { label: string; color: 'info' | 'warning' | 'success' | 'error' | 'neutral' }> = {
  checked_in: { label: 'Checked in', color: 'info' },
  in_progress: { label: 'In progress', color: 'warning' },
  done: { label: 'Done', color: 'success' },
  no_show: { label: 'No show', color: 'error' },
  cancelled: { label: 'Cancelled', color: 'neutral' },
  scheduled: { label: 'Scheduled', color: 'neutral' },
}
const meta = (s: string) => statusMeta[s] ?? { label: s, color: 'neutral' as const }

function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString() : '—'
}
function fmtDateTime(iso: string | null) {
  return iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}
</script>

<template>
  <div v-if="patient" class="max-w-3xl mx-auto flex flex-col gap-4">
    <div>
      <UButton to="/patients" icon="i-lucide-arrow-left" label="Patients" color="neutral" variant="ghost" size="sm" class="-ml-2 mb-2" />
      <div class="flex items-center gap-3">
        <UAvatar :text="`${patient.firstName[0] ?? ''}${patient.lastName[0] ?? ''}`.toUpperCase()" size="lg" color="primary" />
        <div>
          <h1 class="text-xl font-semibold text-highlighted">{{ patient.firstName }} {{ patient.lastName }}</h1>
          <p class="text-sm text-muted">
            DOB {{ fmtDate(patient.dateOfBirth) }}
            <template v-if="patient.phone"> · {{ patient.phone }}</template>
            <template v-if="patient.email"> · {{ patient.email }}</template>
          </p>
        </div>
      </div>
    </div>

    <h2 class="font-medium text-highlighted">
      Visit history
      <span class="text-muted font-normal">({{ patient.visits.length }})</span>
    </h2>

    <p v-if="!patient.visits.length" class="text-sm text-dimmed">No visits recorded.</p>

    <!-- Timeline -->
    <div class="flex flex-col gap-3">
      <UCard v-for="v in patient.visits" :key="v.id" variant="subtle">
        <div class="flex items-center gap-2 flex-wrap">
          <UIcon name="i-lucide-calendar" class="size-4 text-muted" />
          <span class="font-medium text-highlighted">{{ fmtDateTime(v.checkedInAt ?? v.createdAt) }}</span>
          <UBadge :color="meta(v.status).color" variant="subtle" size="sm">{{ meta(v.status).label }}</UBadge>
          <UBadge v-if="v.providerName" color="neutral" variant="subtle" size="sm" icon="i-lucide-stethoscope">
            {{ v.providerName }}
          </UBadge>
        </div>

        <p v-if="v.reason" class="text-sm mt-2">
          <span class="text-muted">Reason:</span> {{ v.reason }}
        </p>

        <!-- Intake history captured at this visit -->
        <div v-if="v.history" class="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div v-for="field in (['allergies', 'conditions', 'medications'] as const)" :key="field">
            <p class="text-xs font-medium text-muted uppercase tracking-wide mb-1">{{ field }}</p>
            <div v-if="v.history[field].length" class="flex flex-wrap gap-1">
              <UBadge
                v-for="item in v.history[field]"
                :key="item"
                :color="field === 'allergies' ? 'error' : 'neutral'"
                variant="subtle"
                size="sm"
              >{{ item }}</UBadge>
            </div>
            <p v-else class="text-sm text-dimmed">None</p>
          </div>
        </div>

        <!-- Chart notes (dentist's post-visit notes) -->
        <div v-if="v.diagnosis || v.comments" class="mt-3 rounded-md bg-elevated/50 p-3">
          <p class="text-xs font-medium text-muted uppercase tracking-wide mb-1">Chart notes</p>
          <p v-if="v.diagnosis" class="text-sm"><span class="text-muted">Diagnosis:</span> {{ v.diagnosis }}</p>
          <p v-if="v.comments" class="text-sm whitespace-pre-wrap">{{ v.comments }}</p>
        </div>

        <!-- AI summary -->
        <div v-if="v.summary" class="mt-3 rounded-md border border-default p-3">
          <div class="flex items-center gap-1.5 mb-1">
            <UIcon name="i-lucide-sparkles" class="size-3.5 text-primary" />
            <p class="text-xs font-medium text-muted uppercase tracking-wide">AI summary</p>
          </div>
          <p class="text-sm whitespace-pre-wrap">{{ v.summary.summaryText }}</p>
          <div v-if="v.summary.structured.riskFlags.length" class="flex flex-wrap gap-1 mt-2">
            <UBadge v-for="f in v.summary.structured.riskFlags" :key="f" color="error" variant="subtle" size="sm">{{ f }}</UBadge>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
