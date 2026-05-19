/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1',
    NEXT_PUBLIC_ADMIN_BASE_URL: process.env.NEXT_PUBLIC_ADMIN_BASE_URL ?? 'http://localhost:3003',
  },
};

export default nextConfig;
