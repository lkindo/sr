import '@testing-library/jest-dom';

import { cleanup } from '@testing-library/react';
import { afterEach, expect, vi } from 'vitest';

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
