# Workshop Branches - Quick Reference

This document provides a quick reference for the workshop branches.

## Branch Overview

### 1. `plain_nuxt_app` - The Starting Point
**Purpose:** Baseline Nuxt application with no instrumentation

**What's included:**
- Plain Nuxt 4 application
- Simple hash API endpoint
- No monitoring libraries

**What's missing:**
- No Dynatrace RUM
- No OpenTelemetry
- Zero observability

**Checkout:**
```bash
git checkout plain_nuxt_app
npm install
npm run dev
```

---

### 2. `dynatrace_rum_nuxt` - Frontend Monitoring Only
**Purpose:** Show frontend RUM monitoring without backend tracing

**What's included:**
- Dynatrace RUM script in `app.vue`
- Frontend user session tracking
- Browser performance monitoring
- `dynatrace.config.ts` configuration

**What's missing:**
- No OpenTelemetry backend instrumentation
- Backend API calls not traced

**The Problem:**
- You can see frontend activity in Dynatrace
- Backend `/api/hash` calls are invisible
- No server-side performance data

**Checkout:**
```bash
git checkout dynatrace_rum_nuxt
cp dynatrace.config.example.ts dynatrace.config.ts
# Edit dynatrace.config.ts with your RUM script URL
npm run dev
```

---

### 3. `nuxt_open_telemetry` - Broken Context Propagation
**Purpose:** Demonstrate the trace context propagation problem

**What's included:**
- Dynatrace RUM (frontend)
- @scayle/nuxt-opentelemetry with automatic NitroInstrumentation
- OTLP exporter to Dynatrace
- Environment variables for backend tracing

**The Critical Problem:**
- Frontend and backend traces are **DISCONNECTED**
- `traceparent` header is sent but **not properly extracted**
- Each backend request creates a **NEW trace** instead of continuing frontend trace

**Evidence:**
```bash
# Server logs will show:
📥 Incoming traceparent: 00-909345e985cb1d64cab2231a9fd2459d-fa583390dc4a57f0-01
❌ Backend created different trace ID: 070332cf16ee32a83fd0665cb5bf1f39
```

**Why it fails:**
- W3CTraceContextPropagator.extract() doesn't work properly in Nitro environment
- NitroInstrumentation doesn't create proper parent-child relationships
- Automatic instrumentation can't access the parsed traceparent data

**Checkout:**
```bash
git checkout nuxt_open_telemetry
cp dynatrace.config.example.ts dynatrace.config.ts
# Edit dynatrace.config.ts

# Create .env file:
cat > .env << EOF
OTEL_SERVICE_NAME=otel-nuxt-demo
OTEL_EXPORTER_OTLP_ENDPOINT=https://YOUR_TENANT.live.dynatrace.com/api/v2/otlp
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Api-Token YOUR_API_TOKEN
EOF

npm run dev
```

---

### 4. `main` - Working Solution
**Purpose:** Complete implementation with proper trace context propagation

**What's included:**
- Dynatrace RUM (frontend)
- Manual trace context propagation plugin (`server/plugins/tracecontext.ts`)
- OpenTelemetry with disabled automatic instrumentation
- PathReplace support for span name normalization
- Comprehensive error handling

**What's fixed:**
- ✅ Frontend and backend traces **CONNECTED**
- ✅ Same Trace ID across entire request flow
- ✅ Proper parent-child span relationships
- ✅ Complete end-to-end distributed tracing

**The Solution:**
1. **Manual traceparent parsing:**
   ```typescript
   const traceparent = event.node.req.headers['traceparent']
   const [, traceId, parentSpanId, traceFlags] = traceparent.split('-')
   ```

2. **Manual span context creation:**
   ```typescript
   const remoteSpanContext = {
     traceId: incomingTraceId,
     spanId: parentSpanId,
     traceFlags: parseInt(traceFlags, 16),
     isRemote: true,
   }
   ```

3. **Start span with parent context:**
   ```typescript
   const parentContext = trace.setSpanContext(context.active(), remoteSpanContext)
   const span = tracer.startSpan(spanName, options, parentContext)
   ```

4. **Disable automatic instrumentation:**
   ```typescript
   const sdk = new NodeSDK({
     instrumentations: [], // Empty!
   })
   ```

**Evidence of success:**
```bash
# Server logs will show:
📥 Incoming traceparent: 00-909345e985cb1d64cab2231a9fd2459d-fa583390dc4a57f0-01
✅ Created span with trace ID: 909345e985cb1d64cab2231a9fd2459d
🎉 SUCCESS! Span trace ID matches incoming trace ID!
```

**Checkout:**
```bash
git checkout main
cp dynatrace.config.example.ts dynatrace.config.ts
# Edit dynatrace.config.ts

# Create .env file
cat > .env << EOF
OTEL_SERVICE_NAME=otel-nuxt-demo
OTEL_EXPORTER_OTLP_ENDPOINT=https://YOUR_TENANT.live.dynatrace.com/api/v2/otlp
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Api-Token YOUR_API_TOKEN
NUXT_OPENTELEMETRY_PATH_REPLACE='["^/(en|de|fr)/", "/:locale/"]'
EOF

npm run dev
```

---

## Workshop Flow

### Recommended Presentation Order

1. **Introduction (2 min)**
   - Explain the challenge: Trace context propagation in Nuxt/Nitro
   - Show the repository structure

2. **Demo 1: Plain App (3 min)**
   - Checkout `plain_nuxt_app`
   - Show simple functionality
   - Highlight: Zero observability

3. **Demo 2: Add RUM (5 min)**
   - Checkout `dynatrace_rum_nuxt`
   - Show Dynatrace RUM in browser
   - Show frontend traces in Dynatrace UI
   - Highlight: Backend is invisible

4. **Demo 3: The Problem (10 min)** ⭐ **MOST IMPORTANT**
   - Checkout `nuxt_open_telemetry`
   - Make requests, show logs
   - Show disconnected traces in Dynatrace
   - Explain why W3CTraceContextPropagator fails
   - This is the "pain point" that justifies the solution

5. **Demo 4: The Solution (10 min)**
   - Checkout `main`
   - Walk through `server/plugins/tracecontext.ts`
   - Show manual parsing and context creation
   - Make requests, show logs
   - Show connected traces in Dynatrace UI
   - Highlight matching Trace IDs

6. **Q&A (5 min)**

---

## Key Talking Points

### Why Automatic Instrumentation Fails

1. **Nitro Environment Constraints:**
   - Nitro uses a custom HTTP server (not standard Node.js http)
   - W3CTraceContextPropagator relies on standard Node.js APIs
   - Automatic instrumentation can't intercept at the right level

2. **Propagator Extract Returns Invalid Context:**
   - `propagator.extract()` reads the header correctly
   - But doesn't create a valid span context object
   - Returns undefined or invalid context in Nitro

3. **NitroInstrumentation Creates New Traces:**
   - Without valid parent context, it creates a new trace
   - This breaks distributed tracing

### Why Manual Instrumentation Works

1. **Direct Header Access:**
   - We can access `event.node.req.headers['traceparent']` directly
   - No reliance on automatic extraction

2. **Manual Span Context Creation:**
   - Parse the traceparent format ourselves
   - Create the span context object with exact values
   - Full control over trace ID, span ID, flags

3. **Explicit Parent Context:**
   - Use `trace.setSpanContext()` to inject parent
   - Start span with explicit parent context
   - Guarantees proper parent-child relationship

---

## Verification Steps

### In Each Branch

After checking out each branch:

```bash
# Start the app
npm run dev

# Make a request
curl -X POST http://localhost:3000/api/hash \
  -H "Content-Type: application/json" \
  -d '{"message":"test"}'

# Check server console for trace IDs
```

### In Dynatrace

1. **Navigate to Distributed Traces:**
   - Observe and explore → Distributed traces

2. **Filter by service:**
   - Filter by `OTEL_SERVICE_NAME` (e.g., `otel-nuxt-demo`)

3. **Compare branches:**
   - `dynatrace_rum_nuxt`: Frontend traces only
   - `nuxt_open_telemetry`: Disconnected frontend/backend
   - `main`: Connected end-to-end traces

---

## Common Questions

### Q: Why not just fix the W3CTraceContextPropagator?
A: The propagator works in standard Node.js environments. The issue is specific to how Nitro handles HTTP requests. Fixing it would require changes to either the propagator or Nitro itself.

### Q: Is this a production-ready solution?
A: Yes! Manual instrumentation is actually more reliable than automatic in this case. It gives you full control and avoids conflicts with automatic instrumentation.

### Q: Does this work with other Nuxt versions?
A: Yes, tested with Nuxt 3.x and 4.x. The Nitro engine is the same.

### Q: Can I use this with other tracing backends (not Dynatrace)?
A: Yes! Just change the `OTEL_EXPORTER_OTLP_ENDPOINT`. The solution is OpenTelemetry-standard.

### Q: What about performance impact?
A: Minimal. Manual parsing is actually faster than automatic instrumentation. OTLP exporter batches spans efficiently.

---

## Troubleshooting

### Branch doesn't run?
```bash
# Clean and reinstall
rm -rf node_modules .nuxt
npm install
npm run dev
```

### Traces not showing in Dynatrace?
- Check `OTEL_EXPORTER_OTLP_ENDPOINT` is correct
- Verify API token has `metrics.ingest` scope
- Check network connectivity to Dynatrace tenant

### RUM script not loading?
- Verify `dynatrace.config.ts` exists
- Check `scriptUrl` is not the placeholder value
- Check browser console for errors

---

## Additional Resources

- [W3C Trace Context Specification](https://www.w3.org/TR/trace-context/)
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Dynatrace OpenTelemetry Integration](https://www.dynatrace.com/support/help/extend-dynatrace/opentelemetry)
- [@scayle/nuxt-opentelemetry](https://github.com/scayle/nuxt-opentelemetry)
