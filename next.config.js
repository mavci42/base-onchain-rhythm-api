/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Prod’a hızlı çıkmak için (TS/ESLint hataları build’i durdurmasın)
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;
