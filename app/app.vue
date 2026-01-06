<template>
  <div class="container">
    <h1>Message Hasher Demo</h1>
    <form @submit.prevent="submitMessage">
      <input v-model="message" placeholder="Enter your message" required>
      <button type="submit">Hash Message</button>
    </form>
    <div v-if="hash">
      <strong>SHA256 Hash:</strong>
      <div>{{ hash }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

// Import Dynatrace RUM configuration
// This file is gitignored - copy from dynatrace.config.example.ts
let dynatraceConfig;
try {
  dynatraceConfig = await import('~/dynatrace.config').then(m => m.dynatraceConfig);
} catch (error) {
  console.warn('Dynatrace config not found. Copy dynatrace.config.example.ts to dynatrace.config.ts');
  dynatraceConfig = { enabled: false, scriptUrl: '' };
}

// Add Dynatrace RUM script to head if enabled
if (dynatraceConfig.enabled && dynatraceConfig.scriptUrl && dynatraceConfig.scriptUrl !== 'YOUR_DYNATRACE_RUM_SCRIPT_URL') {
  useHead({
    script: [
      {
        src: dynatraceConfig.scriptUrl,
        crossorigin: 'anonymous',
        type: 'text/javascript'
      }
    ]
  });
}

const message = ref('');
const hash = ref('');

async function submitMessage() {
  const { data } = await useFetch('/api/hash', {
    method: 'POST',
    body: { message: message.value },
    headers: {
      'X-User-Agent': navigator.userAgent,
      'X-Request-Time': new Date().toISOString(),
      'X-Client-ID': 'nuxt-demo-client'
    },
    onRequest({ request, options }) {
      // Log all headers being sent
      console.log('Request headers:', options.headers);
    },
    onResponse({ response }) {
      console.log('Response status:', response.status);
    }
  });
  hash.value = data.value.hash;
}
</script>

<style scoped>
.container {
  max-width: 500px;
  margin: auto;
  padding: 2rem;
  font-family: system-ui, -apple-system, sans-serif;
}

h1 {
  color: #333;
  margin-bottom: 1.5rem;
}

form {
  margin-bottom: 1.5rem;
}

input {
  width: 70%;
  margin-right: 1rem;
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
}

button {
  padding: 0.5rem 1rem;
  background-color: #0070f3;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:hover {
  background-color: #0051cc;
}

div[v-if] {
  margin-top: 1rem;
  padding: 1rem;
  background-color: #f5f5f5;
  border-radius: 4px;
  word-break: break-all;
}
</style>
