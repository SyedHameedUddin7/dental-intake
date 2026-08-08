<script setup lang="ts">
definePageMeta({ roles: ['admin'] })
</script>

<template>
  <div>
    <h1 class="text-xl font-semibold text-highlighted mb-2">Admin area</h1>
    <UAlert
      color="primary"
      variant="subtle"
      icon="i-lucide-shield"
      title="Admin only"
      description="Only administrators can reach this page."
    />
  </div>
</template>
