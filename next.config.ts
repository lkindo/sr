import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel 배포 최적화 설정
  output: 'standalone',

  // 이미지 최적화
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.public.blob.vercel-storage.com',
      },
    ],
  },

  // 실험적 기능
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },

  // Webpack 설정 (Prisma 최적화)
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push({
        '@prisma/client': 'commonjs @prisma/client',
        'prisma': 'commonjs prisma'
      });
    }
    return config;
  },
};

export default nextConfig;
