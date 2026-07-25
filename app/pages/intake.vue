<script setup lang="ts">
import { z } from 'zod'
import { intakeSchema } from '#shared/schemas/intake'
import type { SummaryResult } from '#shared/schemas/summary'

definePageMeta({ roles: ['admin', 'front_desk'] })

const { profile } = useProfile()

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
      allergies: '', conditions: '', medications: '', symptoms: '', rawTranscript: '',
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
  <div style="max-width:520px;margin:3rem auto;display:flex;flex-direction:column;gap:.75rem">
    <h1>Patient intake</h1>
    <NuxtLink to="/">← Back</NuxtLink>

    <div v-if="success" style="border:1px solid #0a0;padding:.75rem;border-radius:6px">
      <p style="color:#0a0;margin:0">
        Intake saved. Patient ID: <code>{{ success.patientId }}</code>
      </p>
      <button
        v-if="canSummarize"
        :disabled="summarizing"
        style="margin-top:.5rem"
        @click="generateSummary"
      >
        {{ summarizing ? 'Generating…' : 'Generate AI summary' }}
      </button>
      <p v-if="summaryError" style="color:#c00">{{ summaryError }}</p>

      <div v-if="summary" style="margin-top:.75rem">
        <p style="white-space:pre-wrap">{{ summary.summaryText }}</p>
        <p v-if="summary.structured.chiefComplaint">
          <strong>Chief complaint:</strong> {{ summary.structured.chiefComplaint }}
        </p>
        <p v-if="summary.structured.riskFlags.length">
          <strong>Risk flags:</strong> {{ summary.structured.riskFlags.join(', ') }}
        </p>
        <p v-if="summary.structured.recommendations.length">
          <strong>Recommendations:</strong> {{ summary.structured.recommendations.join(', ') }}
        </p>
      </div>
    </div>
    <p v-if="submitError" style="color:#c00">{{ submitError }}</p>

    <fieldset style="border:1px solid #ccc;padding:.75rem;border-radius:6px">
      <legend>🎤 Voice intake (optional)</legend>
      <p style="margin:.25rem 0;font-size:.9em;color:#555">
        Record the patient describing allergies, conditions, medications, and symptoms.
        We'll transcribe it and prefill the fields below for you to review.
      </p>
      <button v-if="!recording" type="button" :disabled="transcribing" @click="startRecording">
        {{ transcribing ? 'Transcribing…' : 'Start recording' }}
      </button>
      <button v-else type="button" @click="stopRecording">■ Stop &amp; transcribe</button>
      <span v-if="recording" style="color:#c00;margin-left:.5rem">● Recording…</span>
      <p v-if="voiceError" style="color:#c00">{{ voiceError }}</p>
      <p v-if="voiceTranscript" style="font-size:.9em;color:#333;white-space:pre-wrap">
        <strong>Transcript:</strong> {{ voiceTranscript }}
      </p>
    </fieldset>

    <label>First name
      <input v-model="form.firstName" />
      <small v-if="errors.firstName" style="color:#c00">{{ errors.firstName[0] }}</small>
    </label>
    <label>Last name
      <input v-model="form.lastName" />
      <small v-if="errors.lastName" style="color:#c00">{{ errors.lastName[0] }}</small>
    </label>
    <label>Date of birth
      <input v-model="form.dateOfBirth" type="date" />
      <small v-if="errors.dateOfBirth" style="color:#c00">{{ errors.dateOfBirth[0] }}</small>
    </label>
    <label>Phone
      <input v-model="form.phone" type="tel" />
      <small v-if="errors.phone" style="color:#c00">{{ errors.phone[0] }}</small>
    </label>
    <label>Email
      <input v-model="form.email" type="email" />
      <small v-if="errors.email" style="color:#c00">{{ errors.email[0] }}</small>
    </label>

    <label>Allergies <em>(comma-separated)</em>
      <input v-model="form.allergies" placeholder="Penicillin, Latex" />
    </label>
    <label>Conditions <em>(comma-separated)</em>
      <input v-model="form.conditions" placeholder="Diabetes, Hypertension" />
    </label>
    <label>Medications <em>(comma-separated)</em>
      <input v-model="form.medications" placeholder="Metformin" />
    </label>
    <label>Symptoms / reason for visit
      <textarea v-model="form.symptoms" rows="3" />
      <small v-if="errors.symptoms" style="color:#c00">{{ errors.symptoms[0] }}</small>
    </label>

    <button :disabled="submitting" @click="submit">
      {{ submitting ? 'Saving…' : 'Save intake' }}
    </button>
  </div>
</template>
