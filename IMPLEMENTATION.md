# OpenTelemetry + Dynatrace Integration Implementation Guide

This guide provides step-by-step instructions to implement end-to-end distributed tracing between your Nuxt application frontend (using Dynatrace RUM) and backend (using OpenTelemetry) with proper trace context propagation.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Package Installation](#package-installation)
- [Configuration Files](#configuration-files)
- [File Creation](#file-creation)
- [Environment Variables](#environment-variables)
- [Testing](#testing)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

- Nuxt 3.x or 4.x application
- Dynatrace tenant with:
  - RUM application configured
  - API token with `metrics.ingest` and `logs.ingest` scopes
- Node.js 18+ and npm/yarn/pnpm

---

## Package Installation

Install the required OpenTelemetry packages:

```bash
npm install --save \
  @opentelemetry/sdk-node \
  @opentelemetry/exporter-trace-otlp-proto \
  @opentelemetry/core \
  @opentelemetry/api \
  @scayle/nuxt-opentelemetry
```

Or with yarn:

```bash
yarn add @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-proto @opentelemetry/core @opentelemetry/api @scayle/nuxt-opentelemetry
```

Or with pnpm:

```bash
pnpm add @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-proto @opentelemetry/core @opentelemetry/api @scayle/nuxt-opentelemetry
```

---

## Configuration Files

### 1. Update `nuxt.config.ts`

Add or update the OpenTelemetry configuration in your `nuxt.config.ts`:

```typescript
export default defineNuxtConfig({
  modules: [
    '@scayle/nuxt-opentelemetry',
  ],

  opentelemetry: {
    enabled: true,
    // Disable automatic initialization - we'll handle it manually
    disableAutomaticInitialization: true,
    // Capture headers for trace propagation
    requestHeaders: ['traceparent', 'tracestate', 'x-dtpc'],
    responseHeaders: ['traceparent', 'tracestate'],
  },

  // ... rest of your config
})
```

### 2. Create Environment Variables File

Create or update your `.env` file in the project root:

```bash
# OpenTelemetry Configuration
OTEL_SERVICE_NAME=your-service-name
OTEL_EXPORTER_OTLP_ENDPOINT=https://YOUR_TENANT.live.dynatrace.com/api/v2/otlp
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Api-Token YOUR_API_TOKEN

# Optional: PathReplace for span name normalization
# Use JSON array format: ["pattern", "replacement"]
# Supports regex patterns (e.g., for locale-based routes)
NUXT_OPENTELEMETRY_PATH_REPLACE='["^/(en|de|fr)/", "/:locale/"]'
```

**Important**: Replace the following placeholders:
- `your-service-name` - Your application name (e.g., `my-nuxt-app`)
- `YOUR_TENANT` - Your Dynatrace tenant ID (e.g., `abc12345`)
- `YOUR_API_TOKEN` - Your Dynatrace API token

**PathReplace Examples**:
```bash
# Normalize locale-based routes
NUXT_OPENTELEMETRY_PATH_REPLACE='["^/(en|de|fr)/", "/:locale/"]'
# Result: /en/api/users, /de/api/users, /fr/api/users → /:locale/api/users

# Normalize tenant-based routes
NUXT_OPENTELEMETRY_PATH_REPLACE='["^/tenant/[^/]+/", "/tenant/:id/"]'
# Result: /tenant/123/api, /tenant/456/api → /tenant/:id/api

# Normalize API versioning
NUXT_OPENTELEMETRY_PATH_REPLACE='["^/v[0-9]+/", "/v:version/"]'
# Result: /v1/users, /v2/users → /v:version/users

# Plain string replacement (no regex)
NUXT_OPENTELEMETRY_PATH_REPLACE='["/api/internal/", "/api/"]'
# Result: /api/internal/users → /api/users
```

---

## File Creation

### 1. Create Server Plugin: `server/plugins/tracecontext.ts`

Create a new file at `server/plugins/tracecontext.ts` with the following content:

```typescript
/**
 * Manual OpenTelemetry Trace Context Propagation Plugin
 * 
 * This plugin manually handles trace context propagation from frontend RUM to backend spans.
 * It replaces the automatic NitroInstrumentation which doesn't support extracting trace context
 * from headers in the Nitro environment.
 * 
 * Features:
 * - Parses W3C traceparent header manually
 * - Creates remote span context from parsed values
 * - Starts spans with proper parent context
 * - Implements OpenTelemetry semantic conventions
 * - Handles errors with proper exception recording
 * - Collects response attributes
 * - PathReplace support for normalizing span names
 * 
 * @see https://www.w3.org/TR/trace-context/
 * @see https://opentelemetry.io/docs/specs/semconv/http/
 */

import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api'

console.log('🚀 Initializing OpenTelemetry SDK...')

// Initialize SDK with OTLP exporter and NO automatic instrumentations
const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter(),
  textMapPropagator: new W3CTraceContextPropagator(),
  // CRITICAL: Empty instrumentations array to prevent NitroInstrumentation conflicts
  instrumentations: [],
})

sdk.start()

console.log('✅ OpenTelemetry SDK initialized')

// PathReplace configuration
let pathReplacePattern: RegExp | string | null = null
let pathReplaceReplacement: string | null = null

try {
  const pathReplaceConfig = process.env.NUXT_OPENTELEMETRY_PATH_REPLACE
  if (pathReplaceConfig) {
    const parsed = JSON.parse(pathReplaceConfig)
    if (Array.isArray(parsed) && parsed.length === 2) {
      const [pattern, replacement] = parsed
      // Detect if pattern is a regex (starts with ^, contains regex special chars)
      if (pattern.startsWith('^') || /[.*+?^${}()|[\]\\]/.test(pattern)) {
        pathReplacePattern = new RegExp(pattern)
      } else {
        pathReplacePattern = pattern
      }
      pathReplaceReplacement = replacement
      console.log('✅ PathReplace configured:', { pattern, replacement })
    }
  }
} catch (error) {
  console.warn('⚠️ Failed to parse NUXT_OPENTELEMETRY_PATH_REPLACE:', error)
}

/**
 * Normalize path using pathReplace configuration
 */
function normalizePath(path: string): string {
  if (!pathReplacePattern || !pathReplaceReplacement) {
    return path
  }
  
  if (pathReplacePattern instanceof RegExp) {
    return path.replace(pathReplacePattern, pathReplaceReplacement)
  } else {
    return path.replace(pathReplacePattern, pathReplaceReplacement)
  }
}

const tracer = trace.getTracer('@scayle/nuxt-opentelemetry', '0.16.2')

export default defineNitroPlugin((nitroApp) => {
  // Hook into request lifecycle
  nitroApp.hooks.hook('request', async (event) => {
    try {
      // Get the traceparent header (W3C Trace Context format)
      const traceparent = event.node.req.headers['traceparent'] as string | undefined

      if (!traceparent) {
        console.log('⚠️ No traceparent header found')
        return
      }

      console.log('📥 Incoming traceparent:', traceparent)

      // Parse traceparent manually: "version-traceId-spanId-traceFlags"
      const parts = traceparent.split('-')
      if (parts.length !== 4) {
        console.warn('⚠️ Invalid traceparent format:', traceparent)
        return
      }

      const [, incomingTraceId, parentSpanId, traceFlags] = parts
      console.log('📥 Incoming Trace ID:', incomingTraceId)
      console.log('📥 Incoming Parent Span ID:', parentSpanId)

      // Manually create the remote span context
      const remoteSpanContext = {
        traceId: incomingTraceId,
        spanId: parentSpanId,
        traceFlags: parseInt(traceFlags, 16),
        isRemote: true,
      }

      console.log('🔧 Manually created remote span context:', remoteSpanContext)

      // Create a context with the remote span context
      const parentContext = trace.setSpanContext(context.active(), remoteSpanContext)

      // Get request path and normalize it
      const requestPath = event.path || event.node.req.url || '/'
      const normalizedPath = normalizePath(requestPath)

      // Start span with parent context
      const span = tracer.startSpan(
        `${event.method} ${normalizedPath}`,
        {
          kind: SpanKind.SERVER,
          attributes: {
            'http.request.method': event.method,
            'url.path': requestPath, // Original path for reference
            'http.route': normalizedPath, // Normalized path for grouping
            'url.scheme': 'http',
            'http.request.header.x-user-agent': event.node.req.headers['user-agent'],
            'http.request.header.x-request-time': new Date().toISOString(),
            'http.request.header.x-client-id': event.node.req.headers['x-client-id'],
          },
        },
        parentContext
      )

      // Verify trace ID matches
      const spanTraceId = span.spanContext().traceId
      console.log('✅ Created span with trace ID:', spanTraceId)

      if (spanTraceId === incomingTraceId) {
        console.log('🎉 SUCCESS! Span trace ID matches incoming trace ID!')
      } else {
        console.error('❌ MISMATCH! Span trace ID does not match incoming trace ID')
        console.error('Expected:', incomingTraceId)
        console.error('Got:', spanTraceId)
      }

      // Store span in event context for later hooks
      event.context.span = span
    } catch (error) {
      console.error('❌ Error in request hook:', error)
    }
  })

  // Hook before response is sent
  nitroApp.hooks.hook('beforeResponse', async (event) => {
    try {
      const span = event.context.span
      if (!span) return

      // Check if span is already ended
      if (span.isEnded?.()) {
        console.warn('⚠️ Span already ended, skipping beforeResponse')
        return
      }

      // Add response attributes
      span.setAttributes({
        'http.response.status_code': event.node.res.statusCode || 200,
        'http.response.header.content-type': event.node.res.getHeader('content-type') as string,
        'http.response.header.content-length': event.node.res.getHeader('content-length') as string,
      })

      // Set span status based on status code
      const statusCode = event.node.res.statusCode || 200
      if (statusCode >= 400) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: `HTTP ${statusCode}`,
        })
      } else {
        span.setStatus({ code: SpanStatusCode.OK })
      }

      console.log('🏁 Ending span with trace ID:', span.spanContext().traceId)
      span.end()
      console.log('✅ FINAL SUCCESS! Trace context properly propagated end-to-end!')
    } catch (error) {
      console.error('❌ Error in beforeResponse hook:', error)
    }
  })

  // Hook for error handling
  nitroApp.hooks.hook('error', async (error, { event }) => {
    try {
      const span = event?.context?.span
      if (!span) return

      // Check if span is already ended
      if (span.isEnded?.()) {
        console.warn('⚠️ Span already ended, skipping error hook')
        return
      }

      // Record exception
      span.recordException(error)
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      })

      console.log('❌ Error recorded in span:', error.message)
      span.end()
    } catch (err) {
      console.error('❌ Error in error hook:', err)
    }
  })

  // Hook after response (cleanup)
  nitroApp.hooks.hook('afterResponse', async (event) => {
    try {
      const span = event.context.span
      if (!span) return

      // Safety check: end span if it wasn't already ended
      if (!span.isEnded?.()) {
        console.warn('⚠️ Span was not ended in beforeResponse, ending now')
        span.end()
      }

      // Clean up
      delete event.context.span
    } catch (error) {
      console.error('❌ Error in afterResponse hook:', error)
    }
  })

  console.log('✅ Trace context plugin hooks registered')
})
```

### 2. Update `app.vue` (Frontend RUM Integration)

Add the Dynatrace RUM script to your `app.vue` file. This enables frontend tracing and generates the `traceparent` header:

```vue
<template>
  <div>
    <NuxtPage />
  </div>
</template>

<script setup lang="ts">
// Add Dynatrace RUM script
useHead({
  script: [
    {
      type: 'text/javascript',
      src: 'https://js-cdn.dynatrace.com/jstag/YOUR_MONITORING_ID/YOUR_APPLICATION_ID/YOUR_ENVIRONMENT_ID/YOUR_CONFIG.js',
      crossorigin: 'anonymous',
    },
  ],
})

// Example: Make a request with custom headers that will include traceparent
const { data: hash } = await useFetch('/api/hash', {
  method: 'POST',
  body: { data: 'test' },
  headers: {
    'x-client-id': 'nuxt-demo-client',
  },
})
</script>

<style scoped>
/* Your styles */
</style>
```

**Important**: Replace the RUM script placeholders:
- Get the complete script URL from your Dynatrace tenant
- Navigate to: Applications & Microservices → Web applications → Your app → Setup
- Copy the JavaScript tag URL

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `OTEL_SERVICE_NAME` | Your service name in Dynatrace | `my-nuxt-app` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Dynatrace OTLP endpoint | `https://abc12345.live.dynatrace.com/api/v2/otlp` |
| `OTEL_EXPORTER_OTLP_HEADERS` | API token for authentication | `Authorization=Api-Token dt0c01.ABC...` |

### Optional Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NUXT_OPENTELEMETRY_PATH_REPLACE` | Path normalization for span names | `'["^/(en\|de\|fr)/", "/:locale/"]'` |

### Creating a Dynatrace API Token

1. Navigate to **Access tokens** in Dynatrace
2. Click **Generate new token**
3. Give it a name (e.g., "OpenTelemetry Ingest")
4. Enable scopes:
   - `metrics.ingest`
   - `logs.ingest` (optional, for future log ingestion)
5. Click **Generate token**
6. Copy the token and add it to your `.env` file

---

## Testing

### 1. Start the Development Server

```bash
npm run dev
```

### 2. Check Console Logs

You should see logs like:

```
🚀 Initializing OpenTelemetry SDK...
✅ OpenTelemetry SDK initialized
✅ Trace context plugin hooks registered
```

If you configured PathReplace:
```
✅ PathReplace configured: { pattern: '^/(en|de|fr)/', replacement: '/:locale/' }
```

### 3. Make Test Requests

Open your browser and navigate to your application. In the browser console and server logs, you should see:

**Server logs:**
```
📥 Incoming traceparent: 00-909345e985cb1d64cab2231a9fd2459d-fa583390dc4a57f0-01
📥 Incoming Trace ID: 909345e985cb1d64cab2231a9fd2459d
📥 Incoming Parent Span ID: fa583390dc4a57f0
✅ Created span with trace ID: 909345e985cb1d64cab2231a9fd2459d
🎉 SUCCESS! Span trace ID matches incoming trace ID!
🏁 Ending span with trace ID: 909345e985cb1d64cab2231a9fd2459d
✅ FINAL SUCCESS! Trace context properly propagated end-to-end!
```

### 4. Test PathReplace (if configured)

If you set `NUXT_OPENTELEMETRY_PATH_REPLACE='["^/(en|de|fr)/", "/:locale/"]'`:

```bash
# Make requests to different locales
curl http://localhost:3000/en/api/hash
curl http://localhost:3000/de/api/hash
curl http://localhost:3000/fr/api/hash
```

All three should create spans with the same name: `POST /:locale/api/hash`

---

## Verification

### In Dynatrace UI

1. **Navigate to Distributed Traces**
   - Go to **Observe and explore → Distributed traces**
   - Filter by service name (your `OTEL_SERVICE_NAME`)

2. **Verify Trace Continuity**
   - You should see complete traces from frontend RUM through backend
   - Frontend user action → RUM span → Backend OpenTelemetry span
   - All spans should share the same Trace ID

3. **Check Span Attributes**
   - Click on a backend span
   - Verify attributes are present:
     - `http.request.method`
     - `url.path` (original path)
     - `http.route` (normalized path if PathReplace is used)
     - `http.response.status_code`
     - Custom headers (user-agent, client-id, etc.)

4. **Verify PathReplace (if configured)**
   - Navigate to **Services → Your service**
   - Click on **Service flow** or **Requests**
   - Verify that similar routes are grouped together
   - Example: `/en/api/users`, `/de/api/users`, `/fr/api/users` should appear as `/:locale/api/users`

### Using curl

Test backend spans without frontend:

```bash
# Test with manual traceparent header
curl -X POST http://localhost:3000/api/hash \
  -H "Content-Type: application/json" \
  -H "traceparent: 00-0123456789abcdef0123456789abcdef-0123456789abcdef-01" \
  -d '{"data":"test"}'
```

Check server logs for trace propagation messages.

---

## Troubleshooting

### Issue: No spans in Dynatrace

**Possible causes:**
1. Incorrect OTLP endpoint or API token
2. Network connectivity issues
3. API token missing required scopes

**Solution:**
```bash
# Verify endpoint is reachable
curl -X POST https://YOUR_TENANT.live.dynatrace.com/api/v2/otlp/v1/traces \
  -H "Authorization: Api-Token YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'

# Should return 200 OK or 400 (not 401/403)
```

### Issue: Disconnected traces (frontend and backend don't connect)

**Possible causes:**
1. RUM script not loaded
2. `traceparent` header not being sent
3. Server plugin not parsing headers correctly

**Solution:**
```bash
# Check if traceparent is being sent from browser
# Open browser DevTools → Network → Select request → Headers
# Look for: traceparent: 00-xxxxx...

# Check server logs for:
📥 Incoming traceparent: 00-...
```

### Issue: PathReplace not working

**Possible causes:**
1. Invalid JSON format in environment variable
2. Regex pattern syntax error
3. Pattern doesn't match your paths

**Solution:**
```bash
# Verify JSON syntax
node -e "console.log(JSON.parse(process.env.NUXT_OPENTELEMETRY_PATH_REPLACE))"

# Check server logs on startup for:
✅ PathReplace configured: { pattern: '...', replacement: '...' }

# Test regex pattern
node -e "console.log('/en/api/users'.replace(/^\\/(en|de|fr)\\//, '/:locale/'))"
# Should output: /:locale/api/users
```

### Issue: Multiple spans with same trace ID

**Possible cause:**
NitroInstrumentation is still enabled and creating conflicting spans.

**Solution:**
Ensure `nuxt.config.ts` has:
```typescript
opentelemetry: {
  disableAutomaticInitialization: true,
}
```

And verify server plugin has:
```typescript
const sdk = new NodeSDK({
  instrumentations: [], // Empty array!
})
```

---

## Production Deployment

### Security Considerations

1. **Never commit `.env` file** - Add to `.gitignore`
2. **Use environment variable management** - Use your cloud provider's secrets manager
3. **Rotate API tokens regularly** - Set expiration dates in Dynatrace
4. **Use separate tokens per environment** - Different tokens for dev/staging/prod

### Performance Considerations

1. **Sampling** - For high-traffic applications, configure sampling:
   ```typescript
   import { TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-node'
   
   const sdk = new NodeSDK({
     sampler: new TraceIdRatioBasedSampler(0.1), // 10% sampling
   })
   ```

2. **Batch exporting** - OTLP exporter batches spans by default (good for production)

3. **Resource attributes** - Add deployment metadata:
   ```typescript
   import { Resource } from '@opentelemetry/resources'
   
   const sdk = new NodeSDK({
     resource: new Resource({
       'service.version': process.env.APP_VERSION,
       'deployment.environment': process.env.NODE_ENV,
     }),
   })
   ```

---

## Next Steps

1. **Add custom spans** - Instrument database calls, external APIs
2. **Add custom attributes** - Business-specific metadata
3. **Configure alerts** - Set up Dynatrace alerting for errors/latency
4. **Dashboard creation** - Build custom dashboards in Dynatrace
5. **Log correlation** - Add trace context to your logs

---

## Support

For issues or questions:
- Dynatrace Documentation: https://www.dynatrace.com/support/help
- OpenTelemetry Documentation: https://opentelemetry.io/docs
- @scayle/nuxt-opentelemetry: https://github.com/scayle/nuxt-opentelemetry

---

## License

This implementation follows the MIT License model used by OpenTelemetry and Nuxt.
