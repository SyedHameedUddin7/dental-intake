<script setup lang="ts">
import { z } from 'zod'
import { createStaffSchema, type StaffMember, type StaffRole } from '#shared/schemas/staff'

definePageMeta({ roles: ['admin'] })

const { data: staff, refresh } = await useFetch<StaffMember[]>('/api/staff')

const roleOptions: { label: string; value: StaffRole }[] = [
  { label: 'Dentist', value: 'dentist' },
  { label: 'Front desk', value: 'front_desk' },
  { label: 'Admin', value: 'admin' },
]
const roleColor: Record<StaffRole, 'primary' | 'info' | 'success'> = {
  admin: 'primary',
  front_desk: 'info',
  dentist: 'success',
}
const roleLabel: Record<StaffRole, string> = {
  admin: 'Admin',
  front_desk: 'Front desk',
  dentist: 'Dentist',
}

const form = reactive<{ fullName: string; email: string; role: StaffRole; password: string }>({
  fullName: '',
  email: '',
  role: 'dentist',
  password: '',
})
const errors = ref<Record<string, string[] | undefined>>({})
const submitError = ref('')
const submitting = ref(false)
// The temp password we just created, shown once so the admin can share it.
const created = ref<{ email: string; password: string } | null>(null)

// Two-click delete: first click arms, second click confirms.
const pendingDeleteId = ref<string | null>(null)
const deletingId = ref<string | null>(null)

async function deleteStaff(id: string) {
  deletingId.value = id
  submitError.value = ''
  try {
    await $fetch(`/api/staff/${id}`, { method: 'DELETE' })
    await refresh()
  } catch (e: any) {
    submitError.value = e?.data?.statusMessage || e?.statusMessage || 'Could not delete staff'
  } finally {
    deletingId.value = null
    pendingDeleteId.value = null
  }
}

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let out = ''
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)]
  form.password = `${out}!`
}

async function submit() {
  submitError.value = ''
  const parsed = createStaffSchema.safeParse({ ...form })
  if (!parsed.success) {
    errors.value = z.flattenError(parsed.error).fieldErrors
    return
  }
  errors.value = {}
  submitting.value = true
  try {
    await $fetch('/api/staff', { method: 'POST', body: parsed.data })
    created.value = { email: form.email, password: form.password }
    Object.assign(form, { fullName: '', email: '', role: 'dentist', password: '' })
    await refresh()
  } catch (e: any) {
    errors.value = e?.data?.data?.fieldErrors ?? {}
    submitError.value = e?.data?.statusMessage || e?.statusMessage || 'Could not create staff'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="max-w-3xl mx-auto flex flex-col gap-4">
    <div class="flex items-center gap-3">
      <div>
        <h1 class="text-xl font-semibold text-highlighted">Staff</h1>
        <p class="text-sm text-muted">Create logins for dentists, front desk and admins.</p>
      </div>
      <UButton to="/audit" icon="i-lucide-scroll-text" label="Audit log" color="neutral" variant="subtle" size="sm" class="ml-auto" />
    </div>

    <!-- Just-created credentials, shown once -->
    <UAlert
      v-if="created"
      color="success"
      variant="subtle"
      icon="i-lucide-check-circle-2"
      title="Login created"
      :close="{ onClick: () => (created = null) }"
    >
      <template #description>
        Share these credentials with the new staff member — the password won't be shown again.
        <div class="mt-2 flex flex-col gap-1 font-mono text-sm">
          <span>Email: <strong>{{ created.email }}</strong></span>
          <span>Password: <strong>{{ created.password }}</strong></span>
        </div>
      </template>
    </UAlert>

    <!-- Add staff -->
    <UCard>
      <h2 class="font-medium text-highlighted mb-3">Add staff</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <UFormField label="Full name" :error="errors.fullName?.[0]">
          <UInput v-model="form.fullName" placeholder="Dr. Sam Patel" class="w-full" />
        </UFormField>
        <UFormField label="Email" :error="errors.email?.[0]">
          <UInput v-model="form.email" type="email" placeholder="sam@clinic.test" class="w-full" />
        </UFormField>
        <UFormField label="Role" :error="errors.role?.[0]">
          <USelect v-model="form.role" :items="roleOptions" class="w-full" />
        </UFormField>
        <UFormField label="Temporary password" :error="errors.password?.[0]">
          <div class="flex gap-2">
            <UInput v-model="form.password" class="flex-1" placeholder="At least 8 characters" />
            <UButton
              icon="i-lucide-dice-5"
              color="neutral"
              variant="subtle"
              aria-label="Generate password"
              @click="generatePassword"
            />
          </div>
        </UFormField>
      </div>

      <UAlert v-if="submitError" class="mt-3" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="submitError" />

      <div class="flex justify-end mt-4">
        <UButton icon="i-lucide-user-plus" :loading="submitting" label="Create login" @click="submit" />
      </div>
    </UCard>

    <!-- Existing staff -->
    <UCard>
      <h2 class="font-medium text-highlighted mb-3">Existing staff ({{ staff?.length ?? 0 }})</h2>
      <div class="divide-y divide-default">
        <div v-for="s in staff" :key="s.id" class="flex items-center gap-3 py-2">
          <UAvatar :text="s.fullName.slice(0, 2).toUpperCase()" size="sm" :color="roleColor[s.role]" />
          <div class="min-w-0">
            <p class="font-medium text-highlighted truncate">{{ s.fullName }}</p>
            <p class="text-sm text-muted truncate">{{ s.email }}</p>
          </div>
          <UBadge :color="roleColor[s.role]" variant="subtle" class="ml-auto">{{ roleLabel[s.role] }}</UBadge>

          <!-- Admin accounts are protected; only dentists and front desk can be removed. -->
          <div v-if="s.role !== 'admin'" class="w-24 flex justify-end">
            <template v-if="pendingDeleteId === s.id">
              <UButton
                label="Delete"
                color="error"
                variant="soft"
                size="xs"
                :loading="deletingId === s.id"
                @click="deleteStaff(s.id)"
              />
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="xs"
                aria-label="Cancel"
                @click="pendingDeleteId = null"
              />
            </template>
            <UButton
              v-else
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="xs"
              aria-label="Delete staff member"
              @click="pendingDeleteId = s.id"
            />
          </div>
          <div v-else class="w-24" />
        </div>
        <p v-if="!staff?.length" class="text-sm text-dimmed py-3">No staff yet.</p>
      </div>
    </UCard>
  </div>
</template>
