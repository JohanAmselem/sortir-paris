import path from 'path'
import type { NextConfig } from 'next'

// Only well-known image hosts go through the Vercel optimiser (quota + no open
// proxy). Other remote images are rendered unoptimized (see EventImage).
import { IMAGE_HOSTS } from './src/lib/image-hosts'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  {
    // Report-only first: observe violations before enforcing.
    key: 'Content-Security-Policy-Report-Only',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://plausible.io https://va.vercel-scripts.com",
      "style-src 'self' 'unsafe-inline' https://api.mapbox.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.mapbox.com https://events.mapbox.com https://plausible.io https://vitals.vercel-insights.com",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self' https://*.supabase.co",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Monorepo root (pnpm workspace) for output file tracing.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  images: {
    remotePatterns: IMAGE_HOSTS.map((hostname) => ({ protocol: 'https' as const, hostname })),
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 7,
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
  async redirects() {
    return [
      { source: '/recherche', destination: '/evenements', permanent: true },
      { source: '/search', destination: '/evenements', permanent: true },
      { source: '/collections/expos-printemps', destination: '/collections/expos-du-moment', permanent: true },
      { source: '/categories/expositions', destination: '/categories/expos', permanent: true },
    ]
  },
}

export default nextConfig
