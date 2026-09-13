export default defineNuxtConfig({
  modules: ['@nuxtjs/supabase', '@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  supabase: {
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
    },
  },
  // Scan the source for the lucide icons actually used and bundle them. Without
  // this only Nuxt UI's own ~43 icons are bundled and the rest are fetched at
  // runtime from the installed @iconify-json/lucide, so they render blank
  // during SSR and break entirely on a .output-only deploy.
  icon: {
    clientBundle: { scan: true },
  },
})
