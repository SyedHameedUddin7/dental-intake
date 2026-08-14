<script setup lang="ts">
import type { AuditEntry, AuditActionType } from '#shared/schemas/audit'

definePageMeta({ roles: ['admin'] })

// 'all' sentinels — reka-ui's Select rejects empty-string option values.
const actionFilter = ref<'all' | AuditActionType>('all')
const entityFilter = ref<'all' | string>('all')

const actionItems = [
  { label: 'All actions', value: 'all' },
  { label: 'View', value: 'view' },
  { label: 'Create', value: 'create' },
  { label: 'Update', value: 'update' },
  { label: 'Delete', value: 'delete' },
]
const entityItems = [
  { label: 'All records', value: 'all' },
  { label: 'Patient', value: 'patient' },
  { label: 'Visit', value: 'visit' },
  { label: 'Staff', value: 'staff' },
]

const query = computed(() => ({
  action: actionFilter.value === 'all' ? '' : actionFilter.value,
  entityType: entityFilter.value === 'all' ? '' : entityFilter.value,
}))
const { data: entries } = await useFetch<AuditEntry[]>('/api/audit', {
  query,
  headers: useRequestHeaders(['cookie']),
})

const actionMeta: Record<AuditActionType, { color: 'neutral' | 'success' | 'info' | 'error'; icon: string }> = {
  view: { color: 'neutral', icon: 'i-lucide-eye' },
  create: { color: 'success', icon: 'i-lucide-plus' },
  update: { color: 'info', icon: 'i-lucide-pencil' },
  delete: { color: 'error', icon: 'i-lucide-trash-2' },
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}
function detail(e: AuditEntry) {
  if (!e.metadata) return ''
  return Object.entries(e.metadata)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ')
}
</script>

<template>
  <div class="max-w-4xl mx-auto flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-3">
      <div>
        <h1 class="text-xl font-semibold text-highlighted">Audit log</h1>
        <p class="text-sm text-muted">Who viewed or changed records, and when.</p>
      </div>
      <div class="ml-auto flex items-center gap-2">
        <USelect v-model="entityFilter" :items="entityItems" size="sm" class="w-36" />
        <USelect v-model="actionFilter" :items="actionItems" size="sm" class="w-36" />
      </div>
    </div>

    <UCard>
      <div class="divide-y divide-default">
        <div v-for="e in entries" :key="e.id" class="flex items-center gap-3 py-2.5 text-sm">
          <UBadge :color="actionMeta[e.action].color" :icon="actionMeta[e.action].icon" variant="subtle" size="sm" class="capitalize">
            {{ e.action }}
          </UBadge>
          <span class="text-highlighted">{{ e.entityType }}</span>
          <span class="text-muted truncate hidden sm:inline">{{ detail(e) }}</span>
          <div class="ml-auto text-right whitespace-nowrap">
            <p class="text-highlighted">{{ e.actorName ?? 'Unknown' }}</p>
            <p class="text-xs text-muted">{{ fmt(e.createdAt) }}</p>
          </div>
        </div>
        <p v-if="!entries?.length" class="text-sm text-dimmed py-6 text-center">No audit entries.</p>
      </div>
    </UCard>
  </div>
</template>
