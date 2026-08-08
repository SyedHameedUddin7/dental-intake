<script setup lang="ts">
definePageMeta({ layout: false })

const supabase = useSupabaseClient()
const user = useSupabaseUser()

const email = ref('')
const password = ref('')
const errorMsg = ref('')
const loading = ref(false)

watch(user, () => {
  if (user.value) navigateTo('/')
}, { immediate: true })

async function signIn() {
  loading.value = true
  errorMsg.value = ''
  const { error } = await supabase.auth.signInWithPassword({
    email: email.value,
    password: password.value,
  })
  if (error) errorMsg.value = error.message
  loading.value = false
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-muted/30 p-4">
    <UCard class="w-full max-w-sm">
      <div class="flex flex-col items-center text-center mb-6">
        <div class="rounded-xl bg-primary/10 p-3 mb-3">
          <UIcon name="i-lucide-activity" class="size-6 text-primary" />
        </div>
        <h1 class="text-lg font-semibold text-highlighted">Dental Intake</h1>
        <p class="text-sm text-muted">Sign in to continue</p>
      </div>

      <form class="flex flex-col gap-3" @submit.prevent="signIn">
        <UFormField label="Email">
          <UInput v-model="email" type="email" placeholder="you@clinic.com" icon="i-lucide-mail" class="w-full" />
        </UFormField>
        <UFormField label="Password">
          <UInput v-model="password" type="password" placeholder="••••••••" icon="i-lucide-lock" class="w-full" />
        </UFormField>

        <UAlert
          v-if="errorMsg"
          color="error"
          variant="subtle"
          :title="errorMsg"
          icon="i-lucide-triangle-alert"
        />

        <UButton type="submit" block :loading="loading" label="Sign in" />
      </form>
    </UCard>
  </div>
</template>
