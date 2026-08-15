import type { NextConfig } from 'next';
import withBundleAnalyzer from '@next/bundle-analyzer';

const analyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  // E2E 개발 서버는 프로덕션 빌드의 `.next`와 별도 디렉터리를 사용한다.
  // 두 모드가 같은 산출물을 번갈아 덮으면 첫 E2E 기동에서 stale chunk/route가
  // 섞일 수 있으므로 playwright.config.ts가 NEXT_DIST_DIR를 지정한다.
  distDir: process.env.NEXT_DIST_DIR?.trim() || '.next',

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

  // 방어 심화: 동적 파일 접근이 실수로 작업 디렉터리 전체를 추적하더라도
  // 로컬 비밀·VCS·AI 도구 파일은 standalone 산출물에 절대 포함하지 않는다.
  outputFileTracingExcludes: {
    '/*': [
      '.env*',
      '**/*.key',
      '**/*.pem',
      '**/*.p12',
      '**/*.pfx',
      '.git/**',
      '.claude/**',
      '.gemini/**',
    ],
  },

  // 외부 서버 패키지 번들링 방지 (Pino, thread-stream 에러 우회)
  //
  // 주의: serverExternalPackages 에 올린 패키지는 standalone 출력의 node_modules 에
  // 심볼릭 링크가 만들어지지 않는다. standalone 만 복사하는 도커 런타임(Dockerfile:81)
  // 에서 기동 시 MODULE_NOT_FOUND 로 죽으므로, 여기에 넣기 전에 반드시 실측할 것.
  serverExternalPackages: ['pino', 'thread-stream'],
};

export default analyzer(nextConfig);
