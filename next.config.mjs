/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow larger request bodies (for image uploads)
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
  // Disable x-powered-by header
  poweredByHeader: false,
};

export default nextConfig;
