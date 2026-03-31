import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'cdn.paris.fr' },
      { protocol: 'https', hostname: 'cdn.openagenda.com' },
      { protocol: 'https', hostname: '**.openagenda.com' },
      { protocol: 'https', hostname: '**.parisinfo.com' },
      { protocol: 'https', hostname: '**.fnac.com' },
      { protocol: 'https', hostname: '**.shotgun.live' },
    ],
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns'],
  },
}

export default nextConfig
