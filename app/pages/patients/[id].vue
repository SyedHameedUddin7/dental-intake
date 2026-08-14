<script setup lang="ts">
import type { PatientDetail, TimelineVisit } from '#shared/schemas/patient'
import type { InsuranceStatus } from '#shared/schemas/insurance'
import type { AuditEntry } from '#shared/schemas/audit'

definePageMeta({ roles: ['admin', 'front_desk', 'dentist'] })

const INS_STATUS: Record<InsuranceStatus, { label: string; color: 'neutral' | 'warning' | 'success' | 'error' }> = {
  unverified: { label: 'Unverified', color: 'neutral' },
  pending: { label: 'Pending', color: 'warning' },
  verified: { label: 'Verified', color: 'success' },
  expired: { label: 'Expired', color: 'error' },
}
const insStatusOptions = (['unverified', 'pending', 'verified', 'expired'] as const).map((v) => ({
  label: INS_STATUS[v].label,
  value: v,
}))

const route = useRoute()
const { profile } = useProfile()
const { data: patient } = await useFetch<PatientDetail>(`/api/patients/${route.params.id}`, {
  headers: useRequestHeaders(['cookie']),
})

// Insurance is owned by front desk (and admins).
const canEditInsurance = computed(() => ['admin', 'front_desk'].includes(profile.value?.role ?? ''))
const editingInsurance = ref(false)
const insDraft = reactive({ insuranceProvider: '', insuranceMemberId: '' })
const savingInsurance = ref(false)
const uploadingCard = ref(false)
const insError = ref('')
const cardInput = ref<HTMLInputElement | null>(null)

function startEditInsurance() {
  editingInsurance.value = true
  insError.value = ''
  insDraft.insuranceProvider = patient.value?.insurance.provider ?? ''
  insDraft.insuranceMemberId = patient.value?.insurance.memberId ?? ''
}
async function saveInsurance() {
  if (!patient.value) return
  savingInsurance.value = true
  insError.value = ''
  try {
    const res = await $fetch(`/api/patients/${patient.value.id}/insurance`, {
      method: 'PATCH',
      body: { ...insDraft, insuranceStatus: patient.value.insurance.status },
    })
    patient.value.insurance.provider = res.provider
    patient.value.insurance.memberId = res.memberId
    patient.value.insurance.status = res.status
    editingInsurance.value = false
  } catch (e: any) {
    insError.value = e?.data?.statusMessage || e?.statusMessage || 'Could not save insurance'
  } finally {
    savingInsurance.value = false
  }
}
// Quick status change without opening the full editor.
async function quickSetStatus(status: InsuranceStatus) {
  if (!patient.value || patient.value.insurance.status === status) return
  const prev = patient.value.insurance.status
  patient.value.insurance.status = status
  insError.value = ''
  try {
    await $fetch(`/api/patients/${patient.value.id}/insurance`, {
      method: 'PATCH',
      body: {
        insuranceProvider: patient.value.insurance.provider ?? '',
        insuranceMemberId: patient.value.insurance.memberId ?? '',
        insuranceStatus: status,
      },
    })
  } catch (e: any) {
    patient.value.insurance.status = prev
    insError.value = e?.data?.statusMessage || e?.statusMessage || 'Could not update status'
  }
}
async function onCardSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !patient.value) return
  uploadingCard.value = true
  insError.value = ''
  try {
    const fd = new FormData()
    fd.append('file', file)
    const res = await $fetch<{ hasCard: boolean; cardUrl: string | null }>(
      `/api/patients/${patient.value.id}/insurance-card`,
      { method: 'POST', body: fd },
    )
    patient.value.insurance.hasCard = res.hasCard
    patient.value.insurance.cardUrl = res.cardUrl
  } catch (e: any) {
    insError.value = e?.data?.statusMessage || e?.statusMessage || 'Upload failed'
  } finally {
    uploadingCard.value = false
    input.value = ''
  }
}

// Chart notes are editable by dentists and admins.
const canEditNotes = computed(() => ['admin', 'dentist'].includes(profile.value?.role ?? ''))

// Admin-only: who has accessed this patient's record (lazy-loaded).
const isAdmin = computed(() => profile.value?.role === 'admin')
const accessLog = ref<AuditEntry[] | null>(null)
const loadingLog = ref(false)
async function loadAccessLog() {
  if (!patient.value) return
  loadingLog.value = true
  try {
    accessLog.value = await $fetch<AuditEntry[]>('/api/audit', {
      query: { entityId: patient.value.id, entityType: 'patient' },
    })
  } catch {
    accessLog.value = []
  } finally {
    loadingLog.value = false
  }
}
function fmtLog(iso: string) {
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}
const editingId = ref<string | null>(null)
const savingId = ref<string | null>(null)
const notesError = ref('')
const draft = reactive({ diagnosis: '', comments: '' })

function startEdit(v: TimelineVisit) {
  editingId.value = v.id
  notesError.value = ''
  draft.diagnosis = v.diagnosis ?? ''
  draft.comments = v.comments ?? ''
}
function cancelEdit() {
  editingId.value = null
}
async function saveNotes(v: TimelineVisit) {
  savingId.value = v.id
  notesError.value = ''
  try {
    const res = await $fetch(`/api/visits/${v.id}/notes`, {
      method: 'PATCH',
      body: { diagnosis: draft.diagnosis, comments: draft.comments },
    })
    v.diagnosis = res.diagnosis
    v.comments = res.comments
    editingId.value = null
  } catch (e: any) {
    notesError.value = e?.data?.statusMessage || e?.statusMessage || 'Could not save notes'
  } finally {
    savingId.value = null
  }
}

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

    <!-- Insurance -->
    <UCard>
      <div class="flex items-center gap-2 mb-3">
        <UIcon name="i-lucide-shield-check" class="size-4 text-primary" />
        <h2 class="font-medium text-highlighted">Insurance</h2>
        <UBadge :color="INS_STATUS[patient.insurance.status].color" variant="subtle" size="sm">
          {{ INS_STATUS[patient.insurance.status].label }}
        </UBadge>

        <div class="ml-auto flex items-center gap-2">
          <USelectMenu
            v-if="canEditInsurance"
            :model-value="patient.insurance.status"
            :items="insStatusOptions"
            value-key="value"
            size="xs"
            class="w-32"
            @update:model-value="quickSetStatus($event)"
          />
          <UButton
            v-if="canEditInsurance && !editingInsurance"
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="Edit insurance"
            @click="startEditInsurance"
          />
        </div>
      </div>

      <div v-if="editingInsurance" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <UFormField label="Provider">
          <UInput v-model="insDraft.insuranceProvider" placeholder="e.g. Delta Dental" class="w-full" />
        </UFormField>
        <UFormField label="Member ID">
          <UInput v-model="insDraft.insuranceMemberId" placeholder="e.g. DD123456789" class="w-full" />
        </UFormField>
        <div class="sm:col-span-2 flex justify-end gap-2">
          <UButton label="Cancel" color="neutral" variant="ghost" size="sm" @click="editingInsurance = false" />
          <UButton label="Save" size="sm" :loading="savingInsurance" @click="saveInsurance" />
        </div>
      </div>
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <div><span class="text-muted">Provider:</span> {{ patient.insurance.provider || '—' }}</div>
        <div><span class="text-muted">Member ID:</span> {{ patient.insurance.memberId || '—' }}</div>
      </div>

      <UAlert v-if="insError" class="mt-3" color="error" variant="subtle" :title="insError" />

      <div class="mt-4">
        <p class="text-xs font-medium text-muted uppercase tracking-wide mb-2">Card image</p>
        <img
          v-if="patient.insurance.cardUrl"
          :src="patient.insurance.cardUrl"
          alt="Insurance card"
          class="max-h-48 rounded-md border border-default"
        />
        <p v-else class="text-sm text-dimmed">No card on file.</p>

        <div v-if="canEditInsurance" class="mt-2">
          <input
            ref="cardInput"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            class="hidden"
            @change="onCardSelected"
          />
          <UButton
            :icon="patient.insurance.hasCard ? 'i-lucide-refresh-cw' : 'i-lucide-upload'"
            :label="patient.insurance.hasCard ? 'Replace card' : 'Upload card'"
            color="neutral"
            variant="subtle"
            size="xs"
            :loading="uploadingCard"
            @click="cardInput?.click()"
          />
        </div>
      </div>
    </UCard>

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
        <div class="mt-3">
          <!-- Editing -->
          <div v-if="editingId === v.id" class="rounded-md border border-default p-3 flex flex-col gap-2">
            <p class="text-xs font-medium text-muted uppercase tracking-wide">Chart notes</p>
            <UFormField label="Diagnosis">
              <UInput v-model="draft.diagnosis" placeholder="e.g. Cracked upper-left molar" class="w-full" />
            </UFormField>
            <UFormField label="Notes">
              <UTextarea v-model="draft.comments" :rows="3" placeholder="Treatment performed, follow-up, etc." class="w-full" />
            </UFormField>
            <UAlert v-if="notesError" color="error" variant="subtle" :title="notesError" />
            <div class="flex gap-2 justify-end">
              <UButton label="Cancel" color="neutral" variant="ghost" size="sm" @click="cancelEdit" />
              <UButton label="Save notes" size="sm" :loading="savingId === v.id" @click="saveNotes(v)" />
            </div>
          </div>

          <!-- Existing notes -->
          <div v-else-if="v.diagnosis || v.comments" class="rounded-md bg-elevated/50 p-3">
            <div class="flex items-center gap-2 mb-1">
              <p class="text-xs font-medium text-muted uppercase tracking-wide">Chart notes</p>
              <UButton
                v-if="canEditNotes"
                icon="i-lucide-pencil"
                color="neutral"
                variant="ghost"
                size="xs"
                aria-label="Edit chart notes"
                class="ml-auto"
                @click="startEdit(v)"
              />
            </div>
            <p v-if="v.diagnosis" class="text-sm"><span class="text-muted">Diagnosis:</span> {{ v.diagnosis }}</p>
            <p v-if="v.comments" class="text-sm whitespace-pre-wrap">{{ v.comments }}</p>
          </div>

          <!-- Empty: prompt to add -->
          <UButton
            v-else-if="canEditNotes"
            icon="i-lucide-plus"
            label="Add chart notes"
            color="neutral"
            variant="subtle"
            size="xs"
            @click="startEdit(v)"
          />
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

    <!-- Record access log (admin-only, lazy-loaded) -->
    <UCard v-if="isAdmin">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-history" class="size-4 text-muted" />
        <h2 class="font-medium text-highlighted">Record access log</h2>
        <UButton
          v-if="accessLog === null"
          label="Show"
          color="neutral"
          variant="subtle"
          size="xs"
          class="ml-auto"
          :loading="loadingLog"
          @click="loadAccessLog"
        />
      </div>
      <div v-if="accessLog" class="mt-3 divide-y divide-default">
        <div v-for="e in accessLog" :key="e.id" class="flex items-center gap-3 py-2 text-sm">
          <span class="capitalize text-highlighted w-16">{{ e.action }}</span>
          <span class="text-muted">{{ e.actorName ?? 'Unknown' }}</span>
          <span class="ml-auto text-xs text-muted">{{ fmtLog(e.createdAt) }}</span>
        </div>
        <p v-if="!accessLog.length" class="text-sm text-dimmed py-2">No access recorded yet.</p>
      </div>
    </UCard>
  </div>
</template>
