<script setup lang="ts">
import type { BoardVisit, VisitStatus } from '#shared/schemas/visit'

definePageMeta({ roles: ['admin', 'front_desk', 'dentist'] })

const supabase = useSupabaseClient()
const { profile } = useProfile()

// Local YYYY-MM-DD (not toISOString, which would shift by timezone).
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const today = toDateStr(new Date())
const selectedDate = ref(today)

// useFetch re-runs automatically when the `date` query ref changes.
// Forward the session cookie so the authed endpoint resolves during SSR (plain
// useFetch doesn't), giving a populated board on first paint rather than only
// after the first realtime refresh.
const { data: visits, refresh } = await useFetch<BoardVisit[]>('/api/visits', {
  query: { date: selectedDate },
  headers: useRequestHeaders(['cookie']),
})

const live = ref(false)
const isToday = computed(() => selectedDate.value === today)
const isDentist = computed(() => profile.value?.role === 'dentist')

const columns: {
  key: VisitStatus
  label: string
  icon: string
  color: 'info' | 'warning' | 'success'
  iconClass: string
}[] = [
  { key: 'checked_in', label: 'Checked in', icon: 'i-lucide-user-check', color: 'info', iconClass: 'text-info' },
  { key: 'in_progress', label: 'In progress', icon: 'i-lucide-loader', color: 'warning', iconClass: 'text-warning' },
  { key: 'done', label: 'Done', icon: 'i-lucide-check-circle-2', color: 'success', iconClass: 'text-success' },
]

function byStatus(status: VisitStatus) {
  return (visits.value ?? []).filter((v) => v.status === status)
}

function initials(v: BoardVisit) {
  return `${v.patientFirstName[0] ?? ''}${v.patientLastName[0] ?? ''}`.toUpperCase()
}

function fmtTime(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

async function setStatus(id: string, status: VisitStatus) {
  await $fetch(`/api/visits/${id}`, { method: 'PATCH', body: { status } })
  // The realtime event will trigger a refresh across all screens; refresh
  // locally too so this screen updates instantly even if the event is slow.
  await refresh()
}

// Subscribe to visit changes and refresh the board live (client only).
let channel: ReturnType<typeof supabase.channel> | null = null
onMounted(() => {
  channel = supabase
    .channel('visits-board')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, () => {
      refresh()
    })
    .subscribe((status) => {
      live.value = status === 'SUBSCRIBED'
    })
})
onUnmounted(() => {
  if (channel) supabase.removeChannel(channel)
})
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center gap-3 mb-6">
      <div>
        <h1 class="text-xl font-semibold text-highlighted">Status board</h1>
        <p class="text-sm text-muted">
          {{ isDentist ? 'Your patients and the available pool' : 'Live view of the floor' }}
        </p>
      </div>

      <div class="ml-auto flex items-center gap-2">
        <UInput v-model="selectedDate" type="date" icon="i-lucide-calendar" :max="today" />
        <UButton
          v-if="!isToday"
          label="Today"
          color="neutral"
          variant="subtle"
          size="sm"
          @click="selectedDate = today"
        />
        <UBadge
          :color="live ? 'success' : 'neutral'"
          variant="subtle"
          :icon="live ? 'i-lucide-radio' : 'i-lucide-loader-circle'"
        >
          {{ live ? 'Live' : 'Connecting…' }}
        </UBadge>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <section v-for="col in columns" :key="col.key" class="flex flex-col">
        <div class="flex items-center gap-2 mb-3">
          <UIcon :name="col.icon" class="size-4" :class="col.iconClass" />
          <h2 class="font-medium text-highlighted">{{ col.label }}</h2>
          <UBadge :color="col.color" variant="subtle" size="sm">{{ byStatus(col.key).length }}</UBadge>
        </div>

        <div class="flex flex-col gap-3">
          <p
            v-if="!byStatus(col.key).length"
            class="text-sm text-dimmed border border-dashed border-default rounded-lg p-4 text-center"
          >
            No patients
          </p>

          <UCard
            v-for="v in byStatus(col.key)"
            :key="v.id"
            variant="subtle"
            :ui="{ body: 'p-3 sm:p-3' }"
          >
            <div class="flex items-start gap-3">
              <UAvatar :text="initials(v)" size="sm" :color="col.color" />
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <NuxtLink
                    :to="`/patients/${v.patientId}`"
                    class="font-medium text-highlighted truncate hover:text-primary hover:underline"
                  >
                    {{ v.patientFirstName }} {{ v.patientLastName }}
                  </NuxtLink>
                  <span class="ml-auto text-xs text-muted whitespace-nowrap">{{ fmtTime(v.checkedInAt) }}</span>
                </div>
                <p v-if="v.reason" class="text-sm text-muted line-clamp-2 mt-0.5">{{ v.reason }}</p>
                <UBadge
                  v-if="v.providerName"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                  icon="i-lucide-stethoscope"
                  class="mt-2"
                >
                  {{ v.providerName }}
                </UBadge>
              </div>
            </div>

            <div class="flex gap-2 mt-3">
              <UButton
                v-if="v.status === 'checked_in'"
                label="Start"
                icon="i-lucide-play"
                color="primary"
                variant="soft"
                size="xs"
                @click="setStatus(v.id, 'in_progress')"
              />
              <UButton
                v-if="v.status === 'in_progress'"
                label="Complete"
                icon="i-lucide-check"
                color="success"
                variant="soft"
                size="xs"
                @click="setStatus(v.id, 'done')"
              />
              <UButton
                v-if="v.status !== 'done'"
                label="No show"
                icon="i-lucide-user-x"
                color="error"
                variant="ghost"
                size="xs"
                @click="setStatus(v.id, 'no_show')"
              />
            </div>
          </UCard>
        </div>
      </section>
    </div>
  </div>
</template>
