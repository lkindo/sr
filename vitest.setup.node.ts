// node 환경 유닛 테스트용 셋업.
//
// `vitest.setup.ts` 와 의도적으로 분리되어 있다. 그쪽은 `@testing-library/jest-dom` 과
// `@testing-library/react` 를 정적 import 하는데, 이 두 줄이 **파일당 setup 비용의 약 93%**
// 를 차지한다(2026-08-10 실측: jsdom + 현행 setup 3.17s/파일 vs node + 이 setup 0.21s/파일).
// DOM 을 전혀 쓰지 않는 138개 파일이 그 비용을 낼 이유가 없다.
//
// ⚠️ 아래 mock 과 환경변수는 `vitest.setup.ts` 와 **반드시 동일하게** 유지할 것.
//    한쪽만 고치면 "node 에서는 통과하는데 jsdom 에서는 실패한다" 는 형태의
//    재현하기 어려운 차이가 생긴다.
import { vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('web-push', () => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn().mockResolvedValue({ statusCode: 201, body: '' }),
}));

process.env.VITEST = 'true';
process.env.NEXTAUTH_URL = 'http://localhost:3000';
process.env.NEXTAUTH_SECRET = 'test-secret-key';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.RATE_LIMIT_STRICT_MAX_REQUESTS = '5';
process.env.RATE_LIMIT_STANDARD_MAX_REQUESTS = '100';
process.env.RATE_LIMIT_RELAXED_MAX_REQUESTS = '300';
