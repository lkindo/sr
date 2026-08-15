/**
 * 500 응답 본문의 정보 유출과 Prisma 오류 매핑에 대한 회귀 테스트 (감사 4.1 / 4.3).
 *
 * 고정하는 계약:
 *   1. 프로덕션의 500 응답은 원본 `error.message` 를 담지 않는다.
 *   2. 원본 메시지는 로그에는 그대로 남는다(디버깅 능력 유지).
 *   3. Prisma 제약 위반은 5xx 가 아니라 해당하는 4xx 로 나간다.
 *   4. `PrismaClientValidationError` 의 스키마 덤프가 응답에 실리지 않는다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { handleApiError } from '@/lib/api-error-handler';
import { logger } from '@/lib/logger';

vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((data, init) => ({ data, status: init?.status || 200 })),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { logRequest: vi.fn(), logError: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

type HandledResponse = { data: { error: string; code: string }; status: number };

const handle = (error: unknown) => handleApiError(error) as unknown as HandledResponse;

/**
 * Prisma 가 실제로 던지는 형태를 흉내낸다. 런타임 클래스를 import 하지 않는 이유는
 * `mapPrismaError` 가 의도적으로 code/name 속성만 보기 때문이다 — errors.ts 는
 * 클라이언트 번들에도 들어가므로 Prisma 런타임을 끌어오면 안 된다.
 */
function prismaError(code: string, meta?: Record<string, unknown>) {
  const error = new Error(
    `\nInvalid \`prisma.sR.findMany()\` invocation:\n\n{ where: { status: "FOO" } }`
  );
  error.name = 'PrismaClientKnownRequestError';
  Object.assign(error, { code, meta });
  return error;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('500 응답의 정보 유출', () => {
  /**
   * 이 문자열은 Prisma 오류 메시지가 실제로 담는 것들의 축약이다 —
   * 모델명, 생성 쿼리 형태, 필드 목록.
   */
  const LEAKY =
    'Invalid `prisma.user.findMany()` invocation: Unknown field `passwordHash` for model `User`';

  it('프로덕션에서는 원본 메시지를 응답에 담지 않는다', () => {
    vi.stubEnv('NODE_ENV', 'production');

    const response = handle(new Error(LEAKY));

    expect(response.status).toBe(500);
    expect(response.data.code).toBe('INTERNAL_ERROR');
    expect(response.data.error).not.toContain('prisma');
    expect(response.data.error).not.toContain('User');
    expect(response.data.error).not.toBe(LEAKY);
  });

  it('프로덕션에서도 원본 메시지는 로그에 남는다', () => {
    vi.stubEnv('NODE_ENV', 'production');

    const error = new Error(LEAKY);
    handle(error);

    // 유출은 막되 디버깅 능력은 잃지 않는다.
    expect(logger.error).toHaveBeenCalledWith('Unexpected error', error, undefined);
  });

  it('개발 환경에서는 원본 메시지를 유지한다', () => {
    vi.stubEnv('NODE_ENV', 'development');

    const response = handle(new Error(LEAKY));

    expect(response.data.error).toBe(LEAKY);
  });
});

describe('Prisma 오류 매핑', () => {
  it('P2002(unique 위반)를 409 로 매핑하고 필드명을 알려준다', () => {
    const response = handle(prismaError('P2002', { target: ['email'] }));

    expect(response.status).toBe(409);
    expect(response.data.error).toContain('email');
    // 모델명과 쿼리 형태는 넘어가지 않는다.
    expect(response.data.error).not.toContain('prisma');
  });

  it('P2002 의 target 이 문자열이어도 처리한다', () => {
    const response = handle(prismaError('P2002', { target: 'clients_code_key' }));

    expect(response.status).toBe(409);
    expect(response.data.error).toContain('clients_code_key');
  });

  it('P2002 의 target 이 없어도 409 를 유지한다', () => {
    const response = handle(prismaError('P2002'));

    expect(response.status).toBe(409);
  });

  it('P2025(대상 없음)를 404 로 매핑한다', () => {
    const response = handle(prismaError('P2025'));

    expect(response.status).toBe(404);
  });

  it('P2003(외래키 위반)을 400 으로 매핑한다', () => {
    const response = handle(prismaError('P2003'));

    expect(response.status).toBe(400);
  });

  it('P2014(필수 관계 위반)를 409 로 매핑한다', () => {
    const response = handle(prismaError('P2014'));

    expect(response.status).toBe(409);
  });

  it('PrismaClientValidationError 를 400 으로 매핑하고 스키마 덤프를 버린다', () => {
    // 이것이 `?status=BOGUS` 로 도달하던 경로다. 예전에는 500 + 아래 메시지 전문이었다.
    const error = new Error(
      'Invalid `prisma.sR.findMany()` invocation:\n\nArgument `status`: Invalid value for argument `status`. Expected SRStatus.'
    );
    error.name = 'PrismaClientValidationError';

    const response = handle(error);

    expect(response.status).toBe(400);
    expect(response.data.error).not.toContain('SRStatus');
    expect(response.data.error).not.toContain('prisma');
  });

  it('매핑 대상이 아닌 Prisma 코드는 500 으로 남는다', () => {
    vi.stubEnv('NODE_ENV', 'production');

    const response = handle(prismaError('P1001')); // 연결 실패는 실제 서버 문제다

    expect(response.status).toBe(500);
  });
});
