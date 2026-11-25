import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)

const nextConfig: NextConfig = {
  // No "X-Powered-By: Next.js" (tells attackers what to try)
  poweredByHeader: false,
  images: {
    localPatterns: [
      {
        pathname: '/api/media/file/**',
      },
    ],
  },
  // The pages live as templates in src/templates and are served with meta data by
  // route handlers (src/app/**/route.ts); public/ only contains CSS, JS and images.
  async redirects() {
    return [
      // Redirect old links (/exhibition.html?id=… is handled by src/app/exhibition.html/route.ts)
      { source: '/events.html', destination: '/events', permanent: true },
      { source: '/exhibitions.html', destination: '/exhibitions', permanent: true },
      { source: '/archive.html', destination: '/archive', permanent: true },
      { source: '/about.html', destination: '/about', permanent: true },
      { source: '/index.html', destination: '/', permanent: true },
    ]
  },
  async headers() {
    return [
      {
        // Security headers for all responses
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          // Other windows (e.g. a page that opened ours) get no handle on our pages
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
      {
        // "sandbox": even if a file contained scripts, it could not run anything.
        // Caching is set per response in src/collections/Media.ts (private: delivery depends
        // on the login, so no shared cache may keep a copy).
        source: '/api/media/file/:path*',
        headers: [{ key: 'Content-Security-Policy', value: "sandbox; default-src 'none'" }],
      },
      {
        // Watermarked copies of photos for sale (src/app/media-wm/[file]/route.ts): same sandbox
        source: '/media-wm/:path*',
        headers: [{ key: 'Content-Security-Policy', value: "sandbox; default-src 'none'" }],
      },
      {
        source: '/:path(css|js)/:file*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' },
        ],
      },
    ]
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
  turbopack: {
    root: path.resolve(dirname),
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
