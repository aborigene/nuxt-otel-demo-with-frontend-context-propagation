# What is this Repository

This is a simple Nuxt application, created to demonstrate how to propagate context from FrontEnd to BackEnd with OpenTelemetry and Dynatrace. This is a challenge because the standard Nitro instrumentations DO NOT PROPAGATE context. So event though frontend is adding the proper TRACEPARENT header, it is being completely ignored by the backend, thus creating a new context.

Follow the instructions below if you want to replicate this instrumentation to your own Nuxt apps. In case you want to test this with this sample app just clone this repo and start the application.

The app is very simple and is composed of a form where a message is POSTED and the backend returns its hash.

# Nuxt Application with Dynatrace RUM

This branch demonstrates Dynatrace Real User Monitoring (RUM) integration with a Nuxt 4 application.

## What's Included

- ✅ Dynatrace RUM script integration in frontend
- ✅ Browser-side tracing and user monitoring
- ❌ Backend OpenTelemetry instrumentation (not yet)
- ❌ Trace context propagation between frontend and backend (not yet)

## Features

- Frontend user action tracking
- Browser performance monitoring
- Client-side error tracking
- **Problem:** Backend API calls are not traced

## Setup

### 1. Create Dynatrace Configuration

```bash
cp dynatrace.config.example.ts dynatrace.config.ts
```

Edit `dynatrace.config.ts` with your Dynatrace RUM script URL:

```typescript
export const dynatraceConfig = {
  scriptUrl: 'https://js-cdn.dynatrace.com/jstag/YOUR_MONITORING_ID/YOUR_APPLICATION_ID/YOUR_ENVIRONMENT_ID/YOUR_CONFIG.js',
  enabled: true,
}
```

### 2. Run the Application

```bash
npm install
npm run dev
```

Navigate to http://localhost:3000

### 3. Verify in Dynatrace

- Go to **Applications & Microservices** → **Web applications**
- You should see user sessions and actions
- **Note:** Backend API calls (`/api/hash`) are not traced yet

## The Problem

While you can see frontend user actions in Dynatrace RUM, the backend API calls made by the application are invisible. There's no visibility into:
- Backend API performance
- Server-side errors
- Database queries
- External service calls

## Next Steps

See the `nuxt_open_telemetry` branch to add backend OpenTelemetry instrumentation.

