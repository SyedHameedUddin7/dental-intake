<script setup lang="ts">
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
  <div style="max-width:320px;margin:4rem auto;display:flex;flex-direction:column;gap:.75rem">
    <h1>Sign in</h1>
    <input v-model="email" type="email" placeholder="Email" @keyup.enter="signIn" />
    <input v-model="password" type="password" placeholder="Password" @keyup.enter="signIn" />
    <button :disabled="loading" @click="signIn">{{ loading ? 'Signing in…' : 'Sign in' }}</button>
    <p v-if="errorMsg" style="color:#c00">{{ errorMsg }}</p>
  </div>
</template>