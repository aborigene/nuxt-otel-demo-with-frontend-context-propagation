// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: true,
  compatibilityDate: '2025-01-06',
  devtools: { enabled: true },
  modules: ['@scayle/nuxt-opentelemetry'],
  opentelemetry: {
    enabled: true,
    disableAutomaticInitialization: true,
    requestHeaders: ['x-user-agent', 'x-request-time', 'x-client-id', 'accept', 'content-type', 'user-agent', 'authorization', 'traceparent', 'x-dtpc'],
    responseHeaders: ['content-type', 'x-response-time']
  },
  runtimeConfig: {
    public: {
      telemetry: {
        serviceName: 'otel-nuxt-demo'
      }
    }
  }
})


