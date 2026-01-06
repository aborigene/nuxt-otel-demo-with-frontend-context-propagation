/**
 * Dynatrace RUM Configuration Template
 * 
 * Copy this file to dynatrace.config.ts and update with your actual values.
 * The dynatrace.config.ts file is gitignored to prevent exposing your monitoring IDs.
 * 
 * To get your script URL:
 * 1. Go to Dynatrace → Applications & Microservices → Web applications
 * 2. Select your application (or create a new one)
 * 3. Click "Setup" or "..." menu → "Setup"
 * 4. Copy the JavaScript tag URL
 */

export const dynatraceConfig = {
  /**
   * Dynatrace RUM script URL
   * Format: https://js-cdn.dynatrace.com/jstag/{monitoring-id}/{application-id}/{environment-id}/{config}.js
   * 
   * Example: 'https://js-cdn.dynatrace.com/jstag/abc12345/bf12345/abc123def456/xyz789.js'
   */
  scriptUrl: 'YOUR_DYNATRACE_RUM_SCRIPT_URL',

  /**
   * Enable or disable RUM monitoring
   * Set to false for local development if needed
   */
  enabled: true,
}
