/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Default API URL = lokální dev. V produkci se nastaví přes env.
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1',
  },
};

export default nextConfig;
