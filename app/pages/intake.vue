<script setup lang="ts">
import { z } from 'zod'
import { intakeSchema } from '#shared/schemas/intake'
import type { SummaryResult } from '#shared/schemas/summary'

definePageMeta({ roles: ['admin', 'front_desk'] })

const { profile } = useProfile()

// Dentists the patient can be assigned to at intake (optional preferred dentist).
// Forward the session cookie so the authed endpoint resolves during SSR — plain
// useFetch doesn't, which would return an empty list (same reason useProfile
// uses useRequestFetch).
const { data: providers } = await useFetch<{ id: string; fullName: string }[]>('/api/providers', {
  headers: useRequestHeaders(['cookie']),
})
const providerOptions = computed(() => [
  { label: 'No preference (unassigned pool)', value: '' },
  ...(providers.value ?? []).map((p) => ({ label: p.fullName, value: p.id })),
])

const form = reactive({
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  phone: '',
  email: '',
  allergies: '',
  conditions: '',
  medications: '',
  symptoms: '',
  providerId: '',
  rawTranscript: '',
})

const errors = ref<Record<string, string[] | undefined>>({})
const submitting = ref(false)
const submitError = ref('')
const success = ref<{ patientId: string; intakeId: string } | null>(null)

const canSummarize = computed(() => profile.value?.role === 'admin' || profile.value?.role === 'dentist')
const summarizing = ref(false)
const summaryError = ref('')
const summary = ref<SummaryResult | null>(null)

// Comma-separated text -> a clean array of trimmed, non-empty tags.
function toList(s: string) {
  return s.split(',').map((v) => v.trim()).filter(Boolean)
}

async function submit() {
  submitError.value = ''
  success.value = null

  const payload = {
    firstName: form.firstName,
    lastName: form.lastName,
    dateOfBirth: form.dateOfBirth,
    phone: form.phone,
    email: form.email,
    allergies: toList(form.allergies),
    conditions: toList(form.conditions),
    medications: toList(form.medications),
    symptoms: form.symptoms,
    providerId: form.providerId || undefined,
    rawTranscript: form.rawTranscript || undefined,
  }

  const parsed = intakeSchema.safeParse(payload)
  if (!parsed.success) {
    errors.value = z.flattenError(parsed.error).fieldErrors
    return
  }
  errors.value = {}

  submitting.value = true
  try {
    const res = await $fetch('/api/intake', { method: 'POST', body: parsed.data })
    success.value = { patientId: res.patientId, intakeId: res.intakeId }
    summary.value = null
    summaryError.value = ''
    Object.assign(form, {
      firstName: '', lastName: '', dateOfBirth: '', phone: '', email: '',
      allergies: '', conditions: '', medications: '', symptoms: '', providerId: '', rawTranscript: '',
    })
    voiceTranscript.value = ''
  } catch (e: any) {
    // Surface server-side field errors if the server rejected validation.
    errors.value = e?.data?.data?.fieldErrors ?? {}
    submitError.value = e?.data?.statusMessage || e?.statusMessage || 'Something went wrong'
  } finally {
    submitting.value = false
  }
}

async function generateSummary() {
  if (!success.value) return
  summaryError.value = ''
  summarizing.value = true
  try {
    const res = await $fetch('/api/summaries', {
      method: 'POST',
      body: { intakeId: success.value.intakeId },
    })
    summary.value = { summaryText: res.summaryText, structured: res.structured } as SummaryResult
  } catch (e: any) {
    summaryError.value = e?.data?.statusMessage || e?.statusMessage || 'Could not generate summary'
  } finally {
    summarizing.value = false
  }
}

// --- Voice intake: record → transcribe (Deepgram) → structure (Groq) → prefill ---
const recording = ref(false)
const transcribing = ref(false)
const voiceError = ref('')
const voiceTranscript = ref('')
let mediaRecorder: MediaRecorder | null = null
let chunks: BlobPart[] = []

async function startRecording() {
  voiceError.value = ''
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    chunks = []
    mediaRecorder = new MediaRecorder(stream)
    mediaRecorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      const blob = new Blob(chunks, { type: mediaRecorder?.mimeType || 'audio/webm' })
      transcribe(blob)
    }
    mediaRecorder.start()
    recording.value = true
  } catch {
    voiceError.value = 'Microphone access denied or unavailable'
  }
}

function stopRecording() {
  mediaRecorder?.stop()
  recording.value = false
}

async function transcribe(blob: Blob) {
  transcribing.value = true
  voiceError.value = ''
  try {
    const fd = new FormData()
    fd.append('audio', blob, 'intake.webm')
    const res = await $fetch('/api/voice', { method: 'POST', body: fd })
    voiceTranscript.value = res.transcript
    // Prefill the medical-history fields for staff to review and correct.
    form.allergies = res.fields.allergies.join(', ')
    form.conditions = res.fields.conditions.join(', ')
    form.medications = res.fields.medications.join(', ')
    form.symptoms = res.fields.symptoms
    form.rawTranscript = res.transcript
  } catch (e: any) {
    voiceError.value = e?.data?.statusMessage || e?.statusMessage || 'Voice processing failed'
  } finally {
    transcribing.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl mx-auto flex flex-col gap-4">
    <div>
      <h1 class="text-xl font-semibold text-highlighted">Patient intake</h1>
      <p class="text-sm text-muted">Register a patient and check them in to the board.</p>
    </div>

    <!-- Success + AI summary -->
    <UCard v-if="success" variant="subtle" class="ring-success/40">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-check-circle-2" class="size-5 text-success" />
        <p class="font-medium text-highlighted">Intake saved & patient checked in</p>
      </div>
      <p class="text-sm text-muted mt-1">
        Patient ID <code class="text-xs">{{ success.patientId }}</code>
      </p>

      <UButton
        v-if="canSummarize"
        class="mt-3"
        icon="i-lucide-sparkles"
        variant="soft"
        :loading="summarizing"
        label="Generate AI summary"
        @click="generateSummary"
      />
      <UAlert v-if="summaryError" class="mt-3" color="error" variant="subtle" :title="summaryError" />

      <div v-if="summary" class="mt-4 flex flex-col gap-3">
        <p class="text-sm whitespace-pre-wrap">{{ summary.summaryText }}</p>
        <div v-if="summary.structured.chiefComplaint">
          <p class="text-xs font-medium text-muted uppercase tracking-wide">Chief complaint</p>
          <p class="text-sm">{{ summary.structured.chiefComplaint }}</p>
        </div>
        <div v-if="summary.structured.riskFlags.length">
          <p class="text-xs font-medium text-muted uppercase tracking-wide mb-1">Risk flags</p>
          <div class="flex flex-wrap gap-1">
            <UBadge v-for="f in summary.structured.riskFlags" :key="f" color="error" variant="subtle">{{ f }}</UBadge>
          </div>
        </div>
        <div v-if="summary.structured.recommendations.length">
          <p class="text-xs font-medium text-muted uppercase tracking-wide mb-1">Recommendations</p>
          <div class="flex flex-wrap gap-1">
            <UBadge v-for="r in summary.structured.recommendations" :key="r" color="info" variant="subtle">{{ r }}</UBadge>
          </div>
        </div>
      </div>
    </UCard>

    <UAlert v-if="submitError" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="submitError" />

    <!-- Voice intake -->
    <UCard variant="subtle">
      <div class="flex items-center gap-2 mb-1">
        <UIcon name="i-lucide-mic" class="size-4 text-primary" />
        <h2 class="font-medium text-highlighted">Voice intake</h2>
        <UBadge color="neutral" variant="subtle" size="sm">Optional</UBadge>
      </div>
      <p class="text-sm text-muted mb-3">
        Record the patient describing allergies, conditions, medications and symptoms.
        We'll transcribe it and prefill the fields below for you to review.
      </p>
      <div class="flex items-center gap-3">
        <UButton
          v-if="!recording"
          icon="i-lucide-mic"
          variant="soft"
          :loading="transcribing"
          :label="transcribing ? 'Transcribing…' : 'Start recording'"
          @click="startRecording"
        />
        <UButton v-else icon="i-lucide-square" color="error" label="Stop & transcribe" @click="stopRecording" />
        <UBadge v-if="recording" color="error" variant="subtle" icon="i-lucide-circle">Recording…</UBadge>
      </div>
      <UAlert v-if="voiceError" class="mt-3" color="error" variant="subtle" :title="voiceError" />
      <div v-if="voiceTranscript" class="mt-3 text-sm text-muted whitespace-pre-wrap border-l-2 border-default pl-3">
        {{ voiceTranscript }}
      </div>
    </UCard>

    <!-- Patient details -->
    <UCard>
      <h2 class="font-medium text-highlighted mb-3">Patient details</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <UFormField label="First name" :error="errors.firstName?.[0]">
          <UInput v-model="form.firstName" class="w-full" />
        </UFormField>
        <UFormField label="Last name" :error="errors.lastName?.[0]">
          <UInput v-model="form.lastName" class="w-full" />
        </UFormField>
        <UFormField label="Date of birth" :error="errors.dateOfBirth?.[0]">
          <UInput v-model="form.dateOfBirth" type="date" class="w-full" />
        </UFormField>
        <UFormField label="Phone" :error="errors.phone?.[0]">
          <UInput v-model="form.phone" type="tel" class="w-full" />
        </UFormField>
        <UFormField label="Email" :error="errors.email?.[0]" class="sm:col-span-2">
          <UInput v-model="form.email" type="email" class="w-full" />
        </UFormField>
        <UFormField label="Preferred dentist" help="Optional — leave as pool for walk-ins" class="sm:col-span-2">
          <USelect
            v-model="form.providerId"
            :items="providerOptions"
            icon="i-lucide-stethoscope"
            class="w-full"
          />
        </UFormField>
      </div>
    </UCard>

    <!-- Medical history -->
    <UCard>
      <h2 class="font-medium text-highlighted mb-3">Medical history</h2>
      <div class="flex flex-col gap-3">
        <UFormField label="Allergies" help="Comma-separated">
          <UInput v-model="form.allergies" placeholder="Penicillin, Latex" class="w-full" />
        </UFormField>
        <UFormField label="Conditions" help="Comma-separated">
          <UInput v-model="form.conditions" placeholder="Diabetes, Hypertension" class="w-full" />
        </UFormField>
        <UFormField label="Medications" help="Comma-separated">
          <UInput v-model="form.medications" placeholder="Metformin" class="w-full" />
        </UFormField>
        <UFormField label="Symptoms / reason for visit" :error="errors.symptoms?.[0]">
          <UTextarea v-model="form.symptoms" :rows="3" class="w-full" />
        </UFormField>
      </div>
    </UCard>

    <div class="flex justify-end">
      <UButton
        size="lg"
        icon="i-lucide-save"
        :loading="submitting"
        label="Save intake"
        @click="submit"
      />
    </div>
  </div>
</template>
