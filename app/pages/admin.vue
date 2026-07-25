<script setup lang="ts">
definePageMeta({ roles: ['admin'] })
</script>

<template>
  <div style="max-width:480px;margin:4rem auto">
    <h1>Admin area</h1>
    <p>Only admins reach this page.</p>
    <NuxtLink to="/">← Back</NuxtLink>
  </div>
</template>