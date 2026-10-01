<script setup lang="ts">
import { z } from 'zod'
import {
  APPOINTMENT_DURATIONS,
  DEFAULT_DURATION_MINUTES,
  clinicHoursLabel,
  type Appointment,
  type BookingConflict,
} from '#shared/schemas/appointment'
import { createPatientSchema, type PatientListItem } from '#shared/schemas/patient'

definePageMeta({ roles: ['admin', 'front_desk', 'dentist'] })

const supabase = useSupabaseClient()
const route = useRoute()
const { profile } = useProfile()
const canBook = computed(() => ['admin', 'front_desk'].includes(profile.value?.role ?? ''))

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const today = toDateStr(new Date())
const selectedDate = ref(today)
const isToday = computed(() => selectedDate.value === today)

const { data: appointments, refresh } = await useFetch<Appointment[]>('/api/appointments', {
  query: { date: selectedDate },
  headers: useRequestHeaders(['cookie']),
})

function shiftDay(delta: number) {
  const d = new Date(`${selectedDate.value}T00:00:00`)
  d.setDate(d.getDate() + delta)
  selectedDate.value = toDateStr(d)
}
const dayLabel = computed(() =>
  new Date(`${selectedDate.value}T00:00:00`).toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }),
)
function fmtTime(iso: string) {
  return iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
}

// Live updates: any visit change (new booking, check-in, cancel) refreshes.
let channel: ReturnType<typeof supabase.channel> | null = null
onMounted(() => {
  // Arriving from a recall ("Book" on an overdue patient) pre-fills the modal.
  const pid = route.query.patientId
  const pname = route.query.patientName
  if (canBook.value && typeof pid === 'string' && typeof pname === 'string') {
    openBook({ id: pid, name: pname })
  }
  channel = supabase
    .channel('schedule')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, () => refresh())
    .subscribe()
})
onUnmounted(() => {
  if (channel) supabase.removeChannel(channel)
})

// --- Actions on an appointment ---
const busyId = ref<string | null>(null)
async function setStatus(id: string, status: 'checked_in' | 'cancelled') {
  busyId.value = id
  try {
    await $fetch(`/api/visits/${id}`, { method: 'PATCH', body: { status } })
    await refresh()
  } finally {
    busyId.value = null
  }
}

// --- Booking modal ---
const bookOpen = ref(false)
const booking = ref(false)
const bookError = ref('')
const NO_PROVIDER = 'none'
const form = reactive({ when: '', providerId: NO_PROVIDER, reason: '', durationMinutes: DEFAULT_DURATION_MINUTES })

const durationOptions = APPOINTMENT_DURATIONS.map((m) => ({ label: `${m} min`, value: m }))
// Populated from a 409: the appointment already holding that dentist's chair.
const conflict = ref<BookingConflict | null>(null)

function fmtRange(iso: string, minutes: number) {
  if (!iso) return ''
  const from = new Date(iso)
  const to = new Date(from.getTime() + minutes * 60_000)
  return `${fmtTime(from.toISOString())}–${fmtTime(to.toISOString())}`
}

// Patient picker
const patientQuery = ref('')
const patientResults = ref<PatientListItem[]>([])
const selectedPatient = ref<{ id: string; name: string } | null>(null)
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(patientQuery, (q) => {
  clearTimeout(searchTimer)
  if (selectedPatient.value) return
  if (!q.trim()) {
    patientResults.value = []
    return
  }
  searchTimer = setTimeout(async () => {
    try {
      patientResults.value = await $fetch<PatientListItem[]>('/api/patients', { query: { q } })
    } catch {
      patientResults.value = []
    }
  }, 300)
})
function pickPatient(p: PatientListItem) {
  selectedPatient.value = { id: p.id, name: `${p.firstName} ${p.lastName}` }
  patientResults.value = []
  patientQuery.value = ''
}

// --- Register a first-time caller ---
// A booking has to reference an existing patient row, and intake was the only
// other way to create one — but intake checks the patient straight in, which
// would drop someone who merely phoned ahead onto today's board. This creates
// the record only; they reach the board when they arrive and are checked in.
const creatingPatient = ref(false)
const creatingBusy = ref(false)
const createError = ref('')
const createErrors = ref<Record<string, string[] | undefined>>({})
const duplicate = ref<{ id: string; firstName: string; lastName: string } | null>(null)
const newPatient = reactive({ firstName: '', lastName: '', dateOfBirth: '', phone: '', email: '' })

function resetCreate() {
  creatingPatient.value = false
  creatingBusy.value = false
  createError.value = ''
  createErrors.value = {}
  duplicate.value = null
  Object.assign(newPatient, { firstName: '', lastName: '', dateOfBirth: '', phone: '', email: '' })
}

function startCreatePatient() {
  resetCreate()
  creatingPatient.value = true
  // Carry over whatever was typed into the search box so it isn't retyped.
  const parts = patientQuery.value.trim().split(/\s+/).filter(Boolean)
  if (parts[0]) newPatient.firstName = parts[0]
  if (parts.length > 1) newPatient.lastName = parts.slice(1).join(' ')
  patientResults.value = []
}

async function createPatient() {
  createError.value = ''
  duplicate.value = null
  const parsed = createPatientSchema.safeParse({ ...newPatient })
  if (!parsed.success) {
    createErrors.value = z.flattenError(parsed.error).fieldErrors
    return
  }
  createErrors.value = {}
  creatingBusy.value = true
  try {
    const created = await $fetch('/api/patients', { method: 'POST', body: parsed.data })
    selectedPatient.value = { id: created.id, name: `${created.firstName} ${created.lastName}` }
    resetCreate()
  } catch (e: any) {
    // 409 carries the clashing record so the booking can just use it instead.
    duplicate.value = e?.data?.data?.existing ?? null
    createErrors.value = e?.data?.data?.fieldErrors ?? {}
    createError.value = e?.data?.statusMessage || e?.statusMessage || 'Could not create patient'
  } finally {
    creatingBusy.value = false
  }
}

function useDuplicate() {
  if (!duplicate.value) return
  const d = duplicate.value
  selectedPatient.value = { id: d.id, name: `${d.firstName} ${d.lastName}` }
  resetCreate()
}

// Providers (dentists) — loaded lazily when the modal opens.
const providers = ref<{ id: string; fullName: string }[]>([])
const providerOptions = computed(() => [
  { label: 'No preference', value: NO_PROVIDER },
  ...providers.value.map((p) => ({ label: p.fullName, value: p.id })),
])

async function openBook(preselect?: { id: string; name: string }) {
  bookError.value = ''
  selectedPatient.value = preselect ?? null
  patientQuery.value = ''
  patientResults.value = []
  resetCreate()
  form.when = `${selectedDate.value}T09:00`
  form.providerId = NO_PROVIDER
  form.reason = ''
  form.durationMinutes = DEFAULT_DURATION_MINUTES
  conflict.value = null
  bookOpen.value = true
  if (!providers.value.length) {
    try {
      providers.value = await $fetch('/api/providers')
    } catch {
      providers.value = []
    }
  }
}

async function book() {
  if (!selectedPatient.value || !form.when) {
    bookError.value = 'Pick a patient and a date/time'
    return
  }
  booking.value = true
  bookError.value = ''
  conflict.value = null
  try {
    await $fetch('/api/appointments', {
      method: 'POST',
      body: {
        patientId: selectedPatient.value.id,
        scheduledAt: new Date(form.when).toISOString(),
        durationMinutes: form.durationMinutes,
        providerId: form.providerId === NO_PROVIDER ? undefined : form.providerId,
        reason: form.reason || undefined,
      },
    })
    bookOpen.value = false
    await refresh()
  } catch (e: any) {
    // 409 carries the clashing appointment so the clash can be named.
    conflict.value = e?.data?.data?.conflict ?? null
    bookError.value = e?.data?.statusMessage || e?.statusMessage || 'Could not book appointment'
  } finally {
    booking.value = false
  }
}
</script>

<template>
  <div class="max-w-3xl mx-auto flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-3">
      <div>
        <h1 class="text-xl font-semibold text-highlighted">Schedule</h1>
        <p class="text-sm text-muted">{{ dayLabel }}</p>
      </div>
      <div class="ml-auto flex items-center gap-2">
        <UButton icon="i-lucide-chevron-left" color="neutral" variant="ghost" size="sm" aria-label="Previous day" @click="shiftDay(-1)" />
        <UInput v-model="selectedDate" type="date" size="sm" />
        <UButton icon="i-lucide-chevron-right" color="neutral" variant="ghost" size="sm" aria-label="Next day" @click="shiftDay(1)" />
        <UButton v-if="!isToday" label="Today" color="neutral" variant="subtle" size="sm" @click="selectedDate = today" />
        <UButton v-if="canBook" icon="i-lucide-calendar-plus" label="Book" size="sm" @click="openBook()" />
      </div>
    </div>

    <UCard>
      <div class="divide-y divide-default">
        <div v-for="a in appointments" :key="a.id" class="flex items-center gap-3 py-3">
          <div class="text-center w-16 shrink-0">
            <p class="font-semibold text-highlighted">{{ fmtTime(a.scheduledAt) }}</p>
            <p class="text-xs text-dimmed">{{ a.durationMinutes }} min</p>
          </div>
          <div class="min-w-0 flex-1">
            <NuxtLink :to="`/patients/${a.patientId}`" class="font-medium text-highlighted hover:text-primary hover:underline">
              {{ a.patientName }}
            </NuxtLink>
            <p v-if="a.reason" class="text-sm text-muted truncate">{{ a.reason }}</p>
            <UBadge v-if="a.providerName" color="neutral" variant="subtle" size="sm" icon="i-lucide-stethoscope" class="mt-1">
              {{ a.providerName }}
            </UBadge>
          </div>
          <div v-if="canBook" class="flex items-center gap-2">
            <UButton
              label="Check in"
              icon="i-lucide-user-check"
              color="primary"
              variant="soft"
              size="xs"
              :loading="busyId === a.id"
              @click="setStatus(a.id, 'checked_in')"
            />
            <UButton
              icon="i-lucide-x"
              color="error"
              variant="ghost"
              size="xs"
              aria-label="Cancel appointment"
              :disabled="busyId === a.id"
              @click="setStatus(a.id, 'cancelled')"
            />
          </div>
        </div>

        <p v-if="!appointments?.length" class="text-sm text-dimmed py-8 text-center">
          No appointments booked for this day.
        </p>
      </div>
    </UCard>

    <!-- Book appointment modal -->
    <UModal v-model:open="bookOpen" title="Book appointment" description="Schedule a future visit for an existing patient.">
      <template #body>
        <div class="flex flex-col gap-3">
          <UFormField label="Patient">
            <div v-if="selectedPatient" class="flex items-center gap-2">
              <UBadge color="primary" variant="subtle" icon="i-lucide-user">{{ selectedPatient.name }}</UBadge>
              <UButton label="Change" color="neutral" variant="ghost" size="xs" @click="selectedPatient = null" />
            </div>
            <div v-else>
              <UInput v-model="patientQuery" icon="i-lucide-search" placeholder="Search patient by name" class="w-full" />
              <div v-if="patientResults.length" class="mt-1 border border-default rounded-md divide-y divide-default max-h-40 overflow-y-auto">
                <button
                  v-for="p in patientResults"
                  :key="p.id"
                  type="button"
                  class="w-full text-left px-3 py-1.5 text-sm hover:bg-elevated/50"
                  @click="pickPatient(p)"
                >
                  {{ p.firstName }} {{ p.lastName }}
                  <span class="text-muted text-xs">· DOB {{ new Date(p.dateOfBirth).toLocaleDateString() }}</span>
                </button>
              </div>
              <div v-if="!creatingPatient" class="mt-2 flex items-center gap-2">
                <p v-if="patientQuery.trim() && !patientResults.length" class="text-xs text-muted">
                  No match on file.
                </p>
                <UButton
                  icon="i-lucide-user-plus"
                  label="New patient"
                  color="neutral"
                  variant="subtle"
                  size="xs"
                  class="ml-auto"
                  @click="startCreatePatient"
                />
              </div>
            </div>
          </UFormField>

          <!-- Register a first-time caller without checking them in -->
          <div v-if="creatingPatient && !selectedPatient" class="rounded-md border border-default p-3 flex flex-col gap-3">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-user-plus" class="size-4 text-primary" />
              <p class="text-xs font-medium text-muted uppercase tracking-wide">New patient</p>
              <UButton
                label="Back to search"
                color="neutral"
                variant="ghost"
                size="xs"
                class="ml-auto"
                @click="resetCreate"
              />
            </div>
            <p class="text-xs text-muted -mt-1">
              Creates the record only — they appear on the board when they arrive and are checked in.
            </p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <UFormField label="First name" :error="createErrors.firstName?.[0]">
                <UInput v-model="newPatient.firstName" class="w-full" />
              </UFormField>
              <UFormField label="Last name" :error="createErrors.lastName?.[0]">
                <UInput v-model="newPatient.lastName" class="w-full" />
              </UFormField>
              <UFormField label="Date of birth" :error="createErrors.dateOfBirth?.[0]">
                <UInput v-model="newPatient.dateOfBirth" type="date" class="w-full" />
              </UFormField>
              <UFormField label="Phone" :error="createErrors.phone?.[0]">
                <UInput v-model="newPatient.phone" type="tel" class="w-full" />
              </UFormField>
              <UFormField label="Email" :error="createErrors.email?.[0]" class="sm:col-span-2">
                <UInput v-model="newPatient.email" type="email" class="w-full" />
              </UFormField>
            </div>

            <UAlert v-if="createError" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="createError">
              <template v-if="duplicate" #actions>
                <UButton label="Use existing record" color="neutral" variant="outline" size="xs" @click="useDuplicate" />
              </template>
            </UAlert>

            <div class="flex justify-end">
              <UButton
                label="Create & select"
                icon="i-lucide-check"
                size="sm"
                :loading="creatingBusy"
                @click="createPatient"
              />
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <UFormField label="Date & time" :help="`Clinic hours ${clinicHoursLabel()}`">
              <UInput v-model="form.when" type="datetime-local" class="w-full" />
            </UFormField>
            <UFormField label="Length">
              <USelect v-model="form.durationMinutes" :items="durationOptions" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Dentist">
            <USelect v-model="form.providerId" :items="providerOptions" class="w-full" />
          </UFormField>
          <UFormField label="Reason">
            <UTextarea v-model="form.reason" :rows="2" placeholder="e.g. 6-month cleaning" class="w-full" />
          </UFormField>

          <UAlert v-if="bookError" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="bookError">
            <template v-if="conflict" #description>
              {{ conflict.providerName ?? 'That dentist' }} has
              {{ conflict.patientName }} booked
              {{ fmtRange(conflict.scheduledAt, conflict.durationMinutes) }}.
              Pick another time, shorten this appointment, or leave the dentist unassigned.
            </template>
          </UAlert>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton label="Cancel" color="neutral" variant="ghost" @click="bookOpen = false" />
          <UButton label="Book" icon="i-lucide-check" :loading="booking" @click="book" />
        </div>
      </template>
    </UModal>
  </div>
</template>
