import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Next caps a Server Action request body at 1MB by default. Every upload
      // in this app is a Server Action, and several of them advertise a much
      // larger limit in their own UI:
      //
      //   /legal    createLegalDocument — MAX_FILE_BYTES = 25MB, and the form
      //             tells the user "Max is 25 MB"
      //   /safety   incident document + photo attachments
      //   /candidates resume upload
      //
      // So anything over 1MB was rejected by the framework with a bare 400
      // BEFORE the action ran — the app's own size check, its friendly error
      // message and its Blob upload never executed. The user saw a failed form
      // with no reason given, having been told 25MB was fine.
      //
      // Found uploading the real 1.07MB Driven Talent employee handbook: it
      // failed on a limit six characters lower than the one on screen. Both
      // legal_documents rows in production have a null file_path, which is what
      // that failure looks like after the fact.
      //
      // Matched to the app's own declared cap so the two agree. The action-level
      // MAX_FILE_BYTES check stays the real gate; this just stops the framework
      // from refusing first.
      bodySizeLimit: "25mb",
    },
  },
};

export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
});
