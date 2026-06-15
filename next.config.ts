import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['prisma', '@prisma/client'],
  webpack: (config, { dev }) => {
    if (dev) config.cache = { type: 'memory' }
    return config
  },
  //allowedDevOrigins: ['smk.arkium.group', 'localhost', '127.0.0.1', '10.1.0.248'],
};

export default nextConfig;
