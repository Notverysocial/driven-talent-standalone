// Sentry server runtime init. Loaded from instrumentation.ts when NEXT_RUNTIME === 'nodejs'.
// No-op when NEXT_PUBLIC_SENTRY_DSN is unset, so non-prod environments aren't affected.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
  debug: false,
});
