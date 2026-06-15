// Sentry edge runtime init (middleware, edge routes). Loaded from instrumentation.ts when NEXT_RUNTIME === 'edge'.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
  debug: false,
});
