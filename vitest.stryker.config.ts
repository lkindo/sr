import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Stryker 전용 vitest 설정.
 *
 * 이 파일의 유일한 목적은 "메인 unit 프로젝트의 빠른 부분집합"을 돌리는 것이다.
 * 테스트 선택 범위(어떤 파일을 돌릴지)만 메인과 달라야 하고, 실행 환경(environment /
 * setupFiles / alias)은 메인과 **반드시 동일**해야 한다. 환경이 갈라지면 Stryker가
 * 검증하는 스위트가 실제 스위트와 다른 물건이 되고, initial test run이 깨져서
 * 뮤테이션 게이트가 통째로 무의미해진다.
 *
 * 2026-07-30에 실제로 그 상태였다(수정 전):
 *   - environment가 'node'라서 renderHook을 쓰는 src/hooks/__tests__/use-toast.coverage.test.ts가
 *     `ReferenceError: document is not defined`로 실패했다.
 *   - bail: 1 때문에 그 첫 실패에서 즉시 중단 → 수집된 108개 파일 중 28개만 실행됐다.
 *   - 메인 설정에 있는 next/server · next/navigation · next/cache alias가 빠져 있어
 *     route 핸들러를 import하는 테스트가 실제 next 런타임을 잡게 되어 있었다.
 * 아래 값들은 그 세 가지를 메인 설정에 다시 맞춘 것이다.
 */
export default defineConfig({
  test: {
    // 메인 vitest.config.ts와 동일해야 한다. 'node'로 두면 DOM을 쓰는 훅 테스트가 죽는다.
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    exclude: [
      'src/stories/**',
      '**/node_modules/**',
      '**/dist/**',
      '**/e2e/**',
      '**/.next/**',
      // 컴포넌트는 stryker.config.mjs의 mutate 목록에서도 제외되어 있으므로
      // 해당 테스트를 돌릴 이유가 없다(속도 목적의 유일한 의도적 축소).
      'src/components/**',
    ],
    // 메인 설정과 동일한 alias. 빠지면 route 핸들러를 import하는 테스트가 깨진다.
    alias: {
      'next/server': path.resolve(__dirname, './src/__tests__/mocks/next-server.ts'),
      'next/navigation': path.resolve(__dirname, './src/__tests__/mocks/next-navigation.ts'),
      'next/cache': path.resolve(__dirname, './src/__tests__/mocks/next-cache.ts'),
      'server-only': path.resolve(__dirname, './src/__tests__/mocks/server-only.ts'),
      '@': path.resolve(__dirname, './src'),
    },
    // bail 없음: Stryker는 initial dry run에서 전체 테스트 목록과 perTest 커버리지를 얻어야 한다.
    // bail이 켜져 있으면 첫 실패에서 끊겨 나머지 테스트가 뮤턴트를 죽일 기회를 잃는다.
    retry: 0,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
