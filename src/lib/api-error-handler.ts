import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { mapPrismaError, ServiceError } from './errors';
import { logger } from './logger';

/**
 * 500 응답 본문에 쓰는 고정 문구.
 *
 * 예전에는 `error.message` 를 그대로 돌려줬다(감사 4.1). 이 자리에 도달하는 것은
 * 우리가 도메인 에러로 분류하지 못한 예외 — 즉 Prisma 내부 오류, 드라이버 오류,
 * 서드파티 라이브러리 오류 — 이고, 그 메시지들은 모델명·필드 목록·연결 문자열 조각·
 * 파일 경로를 담는다. 사용자에게는 아무 쓸모가 없고 공격자에게는 정찰 자료다.
 *
 * 원문은 `logger.error` 로 스택·userId·path·method 와 함께 남으므로 디버깅 능력은
 * 잃지 않는다. 개발 환경에서만 응답에도 실어 로컬 디버깅 편의를 유지한다.
 */
const GENERIC_500_MESSAGE = '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * API Routes에서 에러를 처리하고 적절한 HTTP 응답을 반환하는 헬퍼 함수
 */
export function handleApiError(
  error: unknown,
  context?: { userId?: string; path?: string; method?: string }
): NextResponse {
  // Prisma 오류를 먼저 도메인 에러로 정규화한다.
  // 이 단계가 없으면 중복 생성(P2002)·없는 대상(P2025)·잘못된 enum 값이 전부
  // 아래 500 분기로 떨어진다. 서버 액션 경로(errorToResult)는 이미 같은 순서로 처리한다.
  const mapped = mapPrismaError(error);
  if (mapped) {
    error = mapped;
  }

  // ServiceError 처리
  if (error instanceof ServiceError) {
    logger.logError(error, context);
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
      },
      { status: error.statusCode }
    );
  }

  // Zod 유효성 검증 에러 처리
  if (error instanceof ZodError) {
    const firstError = error.issues?.[0];
    logger.warn('Validation error', {
      ...context,
      custom_validationError: firstError?.message,
      custom_path: firstError?.path?.join('.'),
    });
    return NextResponse.json(
      {
        error: firstError?.message || '유효성 검사 실패',
        code: 'VALIDATION_ERROR',
      },
      { status: 400 }
    );
  }

  // 일반 Error 처리 — 우리가 분류하지 못한 예외.
  // 원문은 로그로만 남기고 응답에는 고정 문구를 쓴다(개발 환경 제외).
  if (error instanceof Error) {
    logger.error('Unexpected error', error, context);
    return NextResponse.json(
      {
        error: isProduction() ? GENERIC_500_MESSAGE : error.message,
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }

  // 알 수 없는 에러
  logger.error('Unknown error', undefined, {
    ...context,
    custom_errorType: typeof error,
    custom_errorValue: String(error),
  });
  return NextResponse.json(
    {
      error: '알 수 없는 오류가 발생했습니다.',
      code: 'UNKNOWN_ERROR',
    },
    { status: 500 }
  );
}
