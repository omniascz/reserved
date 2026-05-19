import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1',
    NEXT_PUBLIC_ADMIN_BASE_URL: process.env.NEXT_PUBLIC_ADMIN_BASE_URL ?? 'http://localhost:4002',
  },
};

// Sentry options:
//   - org/project/authToken: jen při build pro upload source maps.
//   - bez SENTRY_AUTH_TOKEN se source maps neuploadují (build projde, errors fungují
//     ale stack traces jsou minifikované).
//   - silent: lokálně tichý, v CI logujeme upload.
//   - hideSourceMaps: source maps nevystavujeme veřejně (jen Sentry).
const sentryConfig = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
};

export default withSentryConfig(withNextIntl(nextConfig), sentryConfig);
