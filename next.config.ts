import type { NextConfig } from 'next';
import withBundleAnalyzer from '@next/bundle-analyzer';

const analyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  typescript: {
    // 경고: 프로덕션 빌드에서 타입스크립트 에러를 무시합니다.
    // 경고: 이 옵션은 타입 안정성을 해칠 수 있으므로 주의해서 사용해야 합니다.
    ignoreBuildErrors: false,
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '0' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },

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

  // Docker 빌드 최적화
  output: 'standalone',

  // 외부 서버 패키지 번들링 방지 (Pino, thread-stream 에러 우회)
  //
  // 주의: serverExternalPackages 에 올린 패키지는 standalone 출력의 node_modules 에
  // 심볼릭 링크가 만들어지지 않는다. standalone 만 복사하는 도커 런타임(Dockerfile:81)
  // 에서 기동 시 MODULE_NOT_FOUND 로 죽으므로, 여기에 넣기 전에 반드시 실측할 것.
  serverExternalPackages: ['pino', 'thread-stream'],
};

export default analyzer(nextConfig);
