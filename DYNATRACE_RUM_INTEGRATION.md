# Dynatrace RUM to Backend Trace Context Propagation

## Overview

This implementation provides **end-to-end distributed tracing** between Dynatrace Real User Monitoring (RUM) and your Nuxt backend OpenTelemetry instrumentation. It ensures that traces initiated by user interactions in the browser are continued seamlessly into backend API calls, creating a complete picture of request flows through your application.

## The Problem

The `@scayle/nuxt-opentelemetry` library's `NitroInstrumentation` doesn't natively support W3C trace context propagation from incoming `traceparent` headers. This means:
- Frontend traces (from Dynatrace RUM) and backend traces appear as separate, disconnected spans
- You cannot trace a user action from browser → backend → database in a single distributed trace
- Troubleshooting performance issues becomes difficult without the full request flow

## The Solution

We've implemented **manual instrumentation** that:
1. ✅ Extracts W3C `traceparent` headers from incoming requests (sent by Dynatrace RUM)
2. ✅ Parses the trace context and creates backend spans as children of frontend spans  
3. ✅ Maintains proper parent-child relationships in distributed traces
4. ✅ Collects standard OpenTelemetry semantic attributes
5. ✅ Handles errors and exceptions properly
6. ✅ Works in production environments

## Implementation

### 1. Server Plugin: `server/plugins/tracecontext.ts`

Create this file with the manual instrumentation logic. The plugin:
- Initializes the OpenTelemetry SDK without automatic instrumentations
- Manually parses `traceparent` headers from incoming requests
- Creates spans with proper parent context
- Collects HTTP semantic attributes per OpenTelemetry conventions
- Properly ends spans and handles errors

**Key Features:**
- **Trace Context Propagation**: Extracts trace ID and parent span ID from `traceparent` header
- **Semantic Conventions**: Follows OpenTelemetry HTTP semantic conventions for attributes
- **Error Handling**: Records exceptions with full stack traces
- **Production Ready**: Includes graceful error handling and cleanup hooks
- **Configurable**: Uses environment variables for configuration

### 2. Frontend RUM Integration: `app.vue`

Your Nuxt app should include the Dynatrace RUM script:

```vue
<script setup lang="ts">
useHead({
  script: [
    {
      type: 'text/javascript',
      src: 'https://{your-tenant}.live.dynatrace.com/jstag/{script-id}',
      crossorigin: 'anonymous'
    }
  ]
})
</script>
```

The RUM script automatically:
- Generates `traceparent` headers for fetch requests
- Sends them to your backend API endpoints
- Creates frontend spans in Dynatrace

### 3. Environment Variables: `.env`

```bash
# OpenTelemetry Configuration
OTEL_SERVICE_NAME=your-service-name
OTEL_EXPORTER_OTLP_ENDPOINT=https://{your-tenant}.live.dynatrace.com/api/v2/otlp
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Api-Token dt0c01.xxx.your-api-token

# Optional: Configure logging level
OTEL_LOG_LEVEL=info
```

**Security Note:** Never commit API tokens to version control. Use environment variables or secret management tools.

### 4. Nuxt Configuration: `nuxt.config.ts`

```typescript
export default defineNuxtConfig({
  modules: ['@scayle/nuxt-opentelemetry'],
  
  opentelemetry: {
    enabled: true,
    disableAutomaticInitialization: true, // Important: We initialize manually
    
    // Configure which headers to capture (optional)
    requestHeaders: [
      'user-agent',
      'traceparent',  // Critical for trace propagation
      'x-dtpc',       // Dynatrace correlation header
      // Add any custom headers you want to capture
      'x-user-id',
      'x-request-id',
    ],
    responseHeaders: [
      'content-type',
      'x-response-time'
    ]
  }
})
```

## What's Included

### ✅ Trace Context Propagation
- Extracts `traceparent` header from incoming requests
- Parses W3C trace context (trace ID, parent span ID, flags)
- Creates backend spans as children of frontend RUM spans
- **Result**: Unbroken distributed traces from browser to backend

### ✅ OpenTelemetry Semantic Conventions
Collects standard attributes per [OpenTelemetry HTTP conventions](https://opentelemetry.io/docs/specs/semconv/http/):

**Request Attributes:**
- `http.request.method` - HTTP method (GET, POST, etc.)
- `url.path` - Request path
- `url.scheme` - Protocol (http/https)
- `network.protocol.name` - Protocol name (http)
- `network.protocol.version` - HTTP version (1.1, 2.0)
- `client.address` - Client IP address
- `server.address` - Server hostname
- `user_agent.original` - User agent string

**Response Attributes:**
- `http.response.status_code` - HTTP status code
- `http.response.header.content-type` - Response content type
- `http.response.body.size` - Response body size

### ✅ Error Handling
- Records exceptions with full stack traces via `recordException()`
- Sets span status to `ERROR` with descriptive messages
- Adds `error`, `error.type` attributes
- Graceful degradation if span operations fail

### ✅ Span Lifecycle Management
- Proper span start/end timing
- Status codes based on HTTP status (OK, ERROR)
- Cleanup hook to prevent memory leaks
- Checks for already-ended spans before operations

## What's Different from NitroInstrumentation

| Feature | NitroInstrumentation | This Implementation |
|---------|---------------------|---------------------|
| **Trace Context Propagation** | ❌ Not supported | ✅ **Full support** |
| **Semantic Attributes** | ✅ Auto-collected | ✅ **Manually collected** |
| **Error Handling** | ✅ Automatic | ✅ **Manual with graceful degradation** |
| **Custom Attributes** | ✅ Configurable | ✅ **Easily extensible** |
| **Automatic Setup** | ✅ Yes | ⚠️ **Requires manual plugin** |
| **Performance Overhead** | Low | Low (similar) |

## Verification

### 1. Check Logs
When a request comes in with a `traceparent` header, you should see backend spans created with the correct trace ID matching the frontend.

### 2. Dynatrace UI
1. Go to **Distributed Traces** in Dynatrace
2. Find a user action from RUM (e.g., button click that calls API)
3. Click on the trace
4. You should see:
   - Frontend span from RUM (browser)
   - Backend span from your Nuxt server (correctly parented)
   - Any downstream calls (database, external APIs)

### 3. Example Trace Flow
```
Browser (RUM)
  └─ User clicks "Hash Message" button
      └─ POST /api/hash [Nuxt Backend] ← This span has correct trace ID
          └─ crypto.createHash() [Node.js]
```

## Production Considerations

### ✅ Production Ready
- Error handling with try/catch blocks
- Graceful degradation if spans fail
- Cleanup hooks to prevent memory leaks
- No console.log spam (removed debug logging)

### Performance
- **Minimal overhead**: Creating spans is lightweight (~microseconds)
- **Async export**: Spans are exported asynchronously to Dynatrace
- **Sampling**: Can be configured via `OTEL_TRACES_SAMPLER` environment variable

### Security
- API tokens via environment variables only
- No sensitive data in span attributes by default
- Can filter headers via configuration

### Monitoring
Monitor these metrics in production:
- **Span export success rate** (check Dynatrace ingestion)
- **Trace completeness** (% of traces with both RUM and backend spans)
- **Error rate** on spans
- **Span export latency**

## Troubleshooting

### Traces Still Disconnected
**Check:**
1. Is `traceparent` header present in requests? (Check browser DevTools → Network)
2. Is Dynatrace RUM script loaded? (Check browser console)
3. Are spans being exported? (Check Dynatrace → Settings → API Tokens for usage)

**Common Issues:**
- CORS blocking `traceparent` header → Configure CORS to allow it
- RUM script not loaded → Check Dynatrace RUM configuration
- API token missing/invalid → Regenerate token with correct scopes

### High Span Drop Rate
**Check:**
- Network connectivity to Dynatrace OTLP endpoint
- API token has `openTelemetryTrace.ingest` scope
- OTLP endpoint URL is correct (should end with `/api/v2/otlp`)

### Missing Attributes
- Check `requestHeaders`/`responseHeaders` configuration in `nuxt.config.ts`
- Ensure headers are actually present in the request
- Custom attributes can be added in the `request` hook

## Extensibility

### Adding Custom Attributes
In the `request` hook, add:
```typescript
// In server/plugins/tracecontext.ts
span.setAttribute('custom.user.id', event.context.auth?.userId)
span.setAttribute('custom.tenant.id', event.context.tenant?.id)
```

### Adding Database Spans
For database calls, create child spans:
```typescript
const dbSpan = tracer.startSpan('SELECT * FROM users', {
  kind: SpanKind.CLIENT,
  attributes: {
    'db.system': 'postgresql',
    'db.statement': 'SELECT * FROM users WHERE id = $1'
  }
}, event.context.otel.context)

// ... execute query ...

dbSpan.end()
```

### Custom Error Handling
```typescript
nitroApp.hooks.hook('error', (error, { event }) => {
  const span = event?.context?.otel?.span
  if (span) {
    // Add custom error attributes
    span.setAttribute('error.custom.severity', 'critical')
    span.setAttribute('error.custom.team', 'backend')
  }
})
```

## Migration Path

### Short Term (Current Solution)
✅ Use this manual instrumentation for full trace context propagation

### Long Term (Recommended)
When `@scayle/nuxt-opentelemetry` supports trace context propagation:
1. Update to the new version
2. Enable automatic instrumentation
3. Remove `server/plugins/tracecontext.ts`
4. Keep your RUM integration as-is

**We recommend opening an issue/PR with the @scayle/nuxt-opentelemetry project** to add native trace context propagation support.

## Support

For issues or questions:
1. Check this documentation
2. Review Dynatrace OpenTelemetry documentation
3. Check @scayle/nuxt-opentelemetry GitHub issues
4. Contact Dynatrace support for RUM-specific questions

## References

- [OpenTelemetry JavaScript SDK](https://opentelemetry.io/docs/instrumentation/js/)
- [OpenTelemetry HTTP Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/http/)
- [W3C Trace Context Specification](https://www.w3.org/TR/trace-context/)
- [Dynatrace OpenTelemetry Integration](https://docs.dynatrace.com/docs/extend-dynatrace/opentelemetry)
- [@scayle/nuxt-opentelemetry](https://github.com/scayle/telemetry-javascript)
