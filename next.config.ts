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

  // Turbopack 해석 설정
  turbopack: {
    resolveAlias: {
      // `node:inspector` → `inspector`. 두 지정자는 Node 에서 **같은 내장 모듈**이라
      // 런타임 동작은 완전히 동일하다. 접두사를 떼는 이유는 순전히 파일명 때문이다:
      // Turbopack 은 외부 모듈 청크를 지정자 이름으로 만들어
      // `[externals]_node:inspector_*.js` 를 내놓는데, NTFS 는 파일명의 콜론을 대체
      // 데이터 스트림(ADS)으로 해석한다. 그 결과 standalone 복사 단계에서
      // `EINVAL: copyfile` 로 빌드가 죽는다 — Windows 에서만. 리눅스 CI 와 도커는
      // 통과하므로 로컬에서만 깨지는, 더 나쁜 종류의 실패다.
      //
      // 이 참조는 @sentry/node 의 localVariables 통합에서 들어온다.
      'node:inspector': 'inspector',
    },
  },

  // Docker 빌드 최적화
  output: 'standalone',

  // 외부 서버 패키지 번들링 방지 (Pino, thread-stream 에러 우회)
  //
  // Sentry 는 여기 넣지 않는다. serverExternalPackages 에 올린 패키지는 standalone
  // 출력의 node_modules 에 심볼릭 링크가 만들어지지 않아(@sentry/nextjs, @sentry/node
  // 둘 다 실측 확인), standalone 만 복사하는 도커 런타임(Dockerfile:81)에서 기동 시
  // MODULE_NOT_FOUND 로 죽는다. 위의 resolveAlias 가 같은 문제를 부작용 없이 푼다.
  serverExternalPackages: ['pino', 'thread-stream'],
};

export default analyzer(nextConfig);
