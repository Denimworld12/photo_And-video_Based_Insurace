/**
 * Runtime configuration for the PWA.
 *
 * HOW ENVIRONMENT VARIABLES WORK IN A DEPLOYED PWA:
 *
 * 1. REACT_APP_* variables are embedded into the JS bundle at BUILD time by
 *    Create React App / webpack's DefinePlugin. They become static string
 *    literals in the compiled JavaScript.
 *
 * 2. When the PWA is installed, the browser caches the JS bundle (and other
 *    static assets) via the service worker. The env values inside that bundle
 *    stay the same until a NEW build is deployed.
 *
 * 3. When you deploy a new build (with potentially updated env vars), the
 *    service worker detects that the cached files differ from the server
 *    copies and downloads the new bundle. On the next app launch the updated
 *    values take effect automatically — no reinstall needed.
 *
 * 4. If you need to change configuration WITHOUT redeploying the frontend,
 *    you can serve a /config.json from your backend or CDN and fetch it at
 *    runtime. This module supports that pattern via `fetchRuntimeConfig()`.
 *
 * SUMMARY:
 * - Build-time env vars  → baked in, updated when you redeploy the frontend.
 * - Runtime config (JSON) → fetched on every app launch, can change anytime.
 * - PWA updates are automatic — the installed app always gets the latest
 *   deployed version on the next launch after a new deployment.
 */

// Build-time configuration (from .env / .env.production)
const buildConfig = {
  API_URL: process.env.REACT_APP_API_URL || 'http://localhost:5001',
  APP_VERSION: process.env.REACT_APP_VERSION || '2.0.0',
};

// Merged config — starts with build-time values,
// then runtime overrides are applied on top.
let mergedConfig = { ...buildConfig };

/**
 * Optionally fetch /config.json from the server to override
 * build-time settings at runtime. Safe to call on app startup;
 * silently no-ops if the file doesn't exist.
 */
export async function fetchRuntimeConfig() {
  try {
    const res = await fetch('/config.json', { cache: 'no-store' });
    if (res.ok) {
      const runtime = await res.json();
      mergedConfig = { ...buildConfig, ...runtime };
      console.log('[Config] Runtime config loaded:', Object.keys(runtime));
    }
  } catch {
    // config.json doesn't exist or is unreachable — use build-time defaults
  }
  return mergedConfig;
}

/**
 * Get the current (merged) configuration.
 */
export function getConfig() {
  return mergedConfig;
}

export default buildConfig;
