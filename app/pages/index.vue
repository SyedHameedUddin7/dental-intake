<script setup lang="ts">
const user = useSupabaseUser()
const supabase = useSupabaseClient()
const { profile, fetchProfile } = useProfile()
await fetchProfile()

async function signOut() {
  await supabase.auth.signOut()
  navigateTo('/login')
}
</script>

<template>
  <div style="max-width:480px;margin:4rem auto">
    <h1>Dental intake</h1>
    <p>Signed in as {{ user?.email }}</p>
    <p>Role: <strong>{{ profile?.role ?? '…' }}</strong></p>
    <nav style="margin:1rem 0;display:flex;gap:1rem">
      <NuxtLink v-if="profile?.role === 'admin' || profile?.role === 'front_desk'" to="/intake">New intake</NuxtLink>
      <NuxtLink v-if="profile?.role === 'admin'" to="/admin">Admin area</NuxtLink>
    </nav>
    <button @click="signOut">Sign out</button>
  </div>
</template>