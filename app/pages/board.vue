<script setup lang="ts">
import type { BoardVisit, VisitStatus } from '#shared/schemas/visit'

definePageMeta({ roles: ['admin', 'front_desk', 'dentist'] })

const supabase = useSupabaseClient()
const { data: visits, refresh } = await useFetch<BoardVisit[]>('/api/visits')

const live = ref(false)

const columns: { key: VisitStatus; label: string }[] = [
  { key: 'checked_in', label: 'Checked in' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'done', label: 'Done' },
]

function byStatus(status: VisitStatus) {
  return (visits.value ?? []).filter((v) => v.status === status)
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
  <div style="max-width:960px;margin:2rem auto">
    <div style="display:flex;align-items:center;gap:1rem">
      <h1 style="margin:0">Status board</h1>
      <span :style="{ color: live ? '#0a0' : '#999', fontSize: '.9em' }">
        {{ live ? '● Live' : '○ Connecting…' }}
      </span>
      <NuxtLink to="/" style="margin-left:auto">← Back</NuxtLink>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-top:1.5rem">
      <section v-for="col in columns" :key="col.key">
        <h2 style="font-size:1rem;border-bottom:2px solid #ddd;padding-bottom:.25rem">
          {{ col.label }} ({{ byStatus(col.key).length }})
        </h2>

        <p v-if="!byStatus(col.key).length" style="color:#999;font-size:.9em">No patients</p>

        <div
          v-for="v in byStatus(col.key)"
          :key="v.id"
          style="border:1px solid #ddd;border-radius:6px;padding:.6rem;margin-bottom:.6rem"
        >
          <strong>{{ v.patientFirstName }} {{ v.patientLastName }}</strong>
          <span style="float:right;color:#888;font-size:.8em">{{ fmtTime(v.checkedInAt) }}</span>
          <p v-if="v.reason" style="margin:.25rem 0;font-size:.9em;color:#555">{{ v.reason }}</p>

          <div style="display:flex;gap:.4rem;margin-top:.4rem">
            <button v-if="v.status === 'checked_in'" @click="setStatus(v.id, 'in_progress')">Start →</button>
            <button v-if="v.status === 'in_progress'" @click="setStatus(v.id, 'done')">Complete →</button>
            <button
              v-if="v.status !== 'done'"
              style="color:#c00"
              @click="setStatus(v.id, 'no_show')"
            >No show</button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
