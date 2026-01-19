import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { ServiceError } from './errors';
import { logger } from './logger';

/**
 * API Routes에서 에러를 처리하고 적절한 HTTP 응답을 반환하는 헬퍼 함수
 */
export function handleApiError(
  error: unknown,
  context?: { userId?: string; path?: string; method?: string }
): NextResponse {
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

  // 일반 Error 처리
  if (error instanceof Error) {
    logger.error('Unexpected error', error, context);
    return NextResponse.json(
      {
        error: error.message,
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
