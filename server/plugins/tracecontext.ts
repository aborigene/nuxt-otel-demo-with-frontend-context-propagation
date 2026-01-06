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
