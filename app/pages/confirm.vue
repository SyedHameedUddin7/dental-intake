<script setup lang="ts">
// Landing point for Supabase auth callbacks (email confirmation, password
// reset, magic link) — nuxt.config points redirectOptions.callback here. The
// module exchanges the token in the URL for a session, which lands on the user
// ref; we just wait for that and forward.
definePageMeta({ layout: false })

const user = useSupabaseUser()

watch(user, () => {
  if (user.value) navigateTo('/')
}, { immediate: true })
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-muted/30 p-4">
    <div class="flex flex-col items-center gap-3 text-center">
      <UIcon name="i-lucide-loader-circle" class="size-6 text-primary animate-spin" />
      <p class="text-sm text-muted">Signing you in…</p>
    </div>
  </div>
</template>
