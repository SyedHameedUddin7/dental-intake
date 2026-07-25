<script setup lang="ts">
import { z } from 'zod'
import { intakeSchema } from '#shared/schemas/intake'

definePageMeta({ roles: ['admin', 'front_desk'] })

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
})

const errors = ref<Record<string, string[] | undefined>>({})
const submitting = ref(false)
const submitError = ref('')
const success = ref<{ patientId: string } | null>(null)

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
    success.value = { patientId: res.patientId }
    Object.assign(form, {
      firstName: '', lastName: '', dateOfBirth: '', phone: '', email: '',
      allergies: '', conditions: '', medications: '', symptoms: '',
    })
  } catch (e: any) {
    // Surface server-side field errors if the server rejected validation.
    errors.value = e?.data?.data?.fieldErrors ?? {}
    submitError.value = e?.data?.statusMessage || e?.statusMessage || 'Something went wrong'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div style="max-width:520px;margin:3rem auto;display:flex;flex-direction:column;gap:.75rem">
    <h1>Patient intake</h1>
    <NuxtLink to="/">← Back</NuxtLink>

    <p v-if="success" style="color:#0a0">
      Intake saved. Patient ID: <code>{{ success.patientId }}</code>
    </p>
    <p v-if="submitError" style="color:#c00">{{ submitError }}</p>

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
