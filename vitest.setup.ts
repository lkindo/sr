// ⚠️ `/vitest` 서브패스여야 한다. 기본 진입점(`@testing-library/jest-dom`)의 타입은
// **Jest 네임스페이스만** 증강해서, vitest 의 `Assertion` 에는 `toBeInTheDocument` 같은
// 매처가 붙지 않는다. 예전에는 `vitest.shims.d.ts` 의
// `/// <reference types="@vitest/browser-playwright" />` 가 그 타입을 간접적으로 끌어왔는데,
// 그건 Storybook 브라우저 모드 때문에 있던 파일이었다. Storybook 을 걷어내면서
// 매처 타입의 원천을 여기로 명시했다 — 이 줄을 기본 진입점으로 되돌리면
// `pnpm type-check` 가 "Property 'toBeInTheDocument' does not exist" 로 222건 터진다.
import '@testing-library/jest-dom/vitest';

import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

/**
 * `findBy*` / `waitFor` 의 대기 예산을 프로젝트 `testTimeout`(15초)과 정합시킨다.
 *
 * Testing Library 기본값은 **1초**다. 이 값이 vitest 의 테스트 타임아웃과 어긋나 있으면
 * 부하가 걸릴 때 테스트가 "타임아웃" 이 아니라 **`findBy` 가 먼저 던지는 형태**로 깨진다 —
 * 단독 실행은 통과하고 전체 스위트에서만 실패하는, 원인을 찾기 어려운 플레이키가 된다.
 *
 * 실제로 그렇게 한 번 깨졌다: `UserTable.test.tsx` 의 409 확인 다이얼로그 테스트는
 * 팝오버 열기 → 클릭 → 변이 → 409 → 다이얼로그 → 클릭 → 재요청을 연쇄하는데, 각 단계가
 * 1초 예산이었다. 단독(40/40)과 unit-dom 전체(86파일)에서는 통과했고 unit+unit-dom
 * 228파일 동시 실행에서만 실패했다.
 *
 * 5초는 "느린 머신에서도 통과하되 진짜 멈춘 테스트는 여전히 빨리 실패한다" 선이다.
 * 테스트가 실제로 잘못됐을 때의 피드백을 15초까지 늦추지 않기 위해 testTimeout 보다 짧게 둔다.
 */
configure({ asyncUtilTimeout: 5_000 });

// Mock server-only module (used by push.service.ts)
vi.mock('server-only', () => ({}));

// Mock web-push module
vi.mock('web-push', () => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn().mockResolvedValue({ statusCode: 201, body: '' }),
}));

// 각 테스트 후 자동 cleanup
afterEach(() => {
  cleanup();
});

// Mock environment variables
process.env.VITEST = 'true';
process.env.NEXTAUTH_URL = 'http://localhost:3000';
process.env.NEXTAUTH_SECRET = 'test-secret-key';
// 이미 설정된 값이 있으면 덮어쓰지 않는다.
// 단위 테스트는 prisma 를 전부 mock 하므로 이 값이 무엇이든 상관없지만, integration
// 프로젝트는 `extends: true` 로 이 셋업 파일까지 함께 상속받는다. 무조건 대입하면
// CI 가 넘겨준 실제 DATABASE_URL 을 이 가짜 값이 덮어써 DB 통합 테스트가 인증 실패한다.
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.RATE_LIMIT_STRICT_MAX_REQUESTS = '5';
process.env.RATE_LIMIT_STANDARD_MAX_REQUESTS = '100';
process.env.RATE_LIMIT_RELAXED_MAX_REQUESTS = '300';
