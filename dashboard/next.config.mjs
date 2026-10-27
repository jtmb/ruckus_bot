/** @type {import('next').NextConfig} */
const nextConfig = {
  // Bound build workers; this does not change application runtime limits.
  experimental: { cpus: 1 },
};
export default nextConfig;
