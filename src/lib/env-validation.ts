/* eslint-disable no-console */
/**
 * 환경 변수 검증 모듈
 *
 * 애플리케이션 시작 시 필수 환경 변수가 모두 설정되어 있는지 검증합니다.
 * 누락된 변수가 있으면 명확한 에러 메시지와 함께 프로세스를 중단합니다.
 *
 * @example
 * ```typescript
 * // 앱 시작 시 검증 실행
 * import { validateEnv } from './lib/env-validation';
 * validateEnv();
 * ```
 */

export interface EnvVariable {
  /**
   * 환경 변수 이름
   */
  name: string;

  /**
   * 필수 여부
   */
  required: boolean;

  /**
   * 설명
   */
  description: string;

  /**
   * 카테고리
   */
  category: 'database' | 'auth' | 'storage' | 'cache' | 'email' | 'queue' | 'webhook' | 'rate-limit';

  /**
   * 검증 함수 (선택사항)
   */
  validate?: (value: string) => boolean;

  /**
   * 검증 실패 시 에러 메시지
   */
  validationError?: string;
}

/**
 * 환경 변수 정의
 */
export const ENV_VARIABLES: EnvVariable[] = [
  // Database
  {
    name: 'DATABASE_URL',
    required: true,
    description: 'PostgreSQL 데이터베이스 연결 URL (PgBouncer 사용)',
    category: 'database',
    validate: (value) => value.startsWith('postgresql://'),
    validationError: 'DATABASE_URL은 postgresql:// 로 시작해야 합니다.',
  },
  {
    name: 'DIRECT_URL',
    required: true,
    description: 'PostgreSQL 직접 연결 URL (마이그레이션용)',
    category: 'database',
    validate: (value) => value.startsWith('postgresql://'),
    validationError: 'DIRECT_URL은 postgresql:// 로 시작해야 합니다.',
  },

  // NextAuth
  {
    name: 'NEXTAUTH_SECRET',
    required: true,
    description: 'NextAuth 세션 암호화 시크릿 (최소 32자)',
    category: 'auth',
    validate: (value) => value.length >= 32,
    validationError: 'NEXTAUTH_SECRET은 최소 32자 이상이어야 합니다.',
  },
  {
    name: 'NEXTAUTH_URL',
    required: true,
    description: 'NextAuth 콜백 URL',
    category: 'auth',
    validate: (value) => value.startsWith('http://') || value.startsWith('https://'),
    validationError: 'NEXTAUTH_URL은 http:// 또는 https:// 로 시작해야 합니다.',
  },

  // Vercel Blob
  {
    name: 'BLOB_READ_WRITE_TOKEN',
    required: true,
    description: 'Vercel Blob 스토리지 토큰 (파일 업로드용)',
    category: 'storage',
  },

  // Upstash Redis
  {
    name: 'UPSTASH_REDIS_REST_URL',
    required: false, // Redis Rate Limiter 사용 시 필요
    description: 'Upstash Redis REST API URL',
    category: 'cache',
    validate: (value) => value.startsWith('https://'),
    validationError: 'UPSTASH_REDIS_REST_URL은 https:// 로 시작해야 합니다.',
  },
  {
    name: 'UPSTASH_REDIS_REST_TOKEN',
    required: false,
    description: 'Upstash Redis REST API 토큰',
    category: 'cache',
  },

  // Resend
  {
    name: 'RESEND_API_KEY',
    required: false, // 이메일 알림 사용 시 필요
    description: 'Resend 이메일 발송 API 키 (이메일 알림 사용 시 필요)',
    category: 'email',
    validate: (value) => value.startsWith('re_'),
    validationError: 'RESEND_API_KEY는 re_ 로 시작해야 합니다.',
  },

  // Inngest
  {
    name: 'INNGEST_EVENT_KEY',
    required: false, // 백그라운드 작업 사용 시 필요
    description: 'Inngest 이벤트 전송 키 (백그라운드 작업 사용 시 필요)',
    category: 'queue',
  },
  {
    name: 'INNGEST_SIGNING_KEY',
    required: false, // 백그라운드 작업 사용 시 필요
    description: 'Inngest 요청 서명 검증 키 (백그라운드 작업 사용 시 필요)',
    category: 'queue',
  },



  // Rate Limiting (선택사항)
  {
    name: 'RATE_LIMIT_STRICT_WINDOW_MS',
    required: false,
    description: 'Strict Rate Limit 윈도우 (밀리초)',
    category: 'rate-limit',
    validate: (value) => !isNaN(parseInt(value)) && parseInt(value) > 0,
    validationError: 'RATE_LIMIT_STRICT_WINDOW_MS는 양의 정수여야 합니다.',
  },
  {
    name: 'RATE_LIMIT_STRICT_MAX_REQUESTS',
    required: false,
    description: 'Strict Rate Limit 최대 요청 수',
    category: 'rate-limit',
    validate: (value) => !isNaN(parseInt(value)) && parseInt(value) > 0,
    validationError: 'RATE_LIMIT_STRICT_MAX_REQUESTS는 양의 정수여야 합니다.',
  },
  {
    name: 'RATE_LIMIT_STANDARD_WINDOW_MS',
    required: false,
    description: 'Standard Rate Limit 윈도우 (밀리초)',
    category: 'rate-limit',
    validate: (value) => !isNaN(parseInt(value)) && parseInt(value) > 0,
    validationError: 'RATE_LIMIT_STANDARD_WINDOW_MS는 양의 정수여야 합니다.',
  },
  {
    name: 'RATE_LIMIT_STANDARD_MAX_REQUESTS',
    required: false,
    description: 'Standard Rate Limit 최대 요청 수',
    category: 'rate-limit',
    validate: (value) => !isNaN(parseInt(value)) && parseInt(value) > 0,
    validationError: 'RATE_LIMIT_STANDARD_MAX_REQUESTS는 양의 정수여야 합니다.',
  },
  {
    name: 'RATE_LIMIT_RELAXED_WINDOW_MS',
    required: false,
    description: 'Relaxed Rate Limit 윈도우 (밀리초)',
    category: 'rate-limit',
    validate: (value) => !isNaN(parseInt(value)) && parseInt(value) > 0,
    validationError: 'RATE_LIMIT_RELAXED_WINDOW_MS는 양의 정수여야 합니다.',
  },
  {
    name: 'RATE_LIMIT_RELAXED_MAX_REQUESTS',
    required: false,
    description: 'Relaxed Rate Limit 최대 요청 수',
    category: 'rate-limit',
    validate: (value) => !isNaN(parseInt(value)) && parseInt(value) > 0,
    validationError: 'RATE_LIMIT_RELAXED_MAX_REQUESTS는 양의 정수여야 합니다.',
  },
  {
    name: 'RATE_LIMIT_FILE_UPLOAD_WINDOW_MS',
    required: false,
    description: 'File Upload Rate Limit 윈도우 (밀리초)',
    category: 'rate-limit',
    validate: (value) => !isNaN(parseInt(value)) && parseInt(value) > 0,
    validationError: 'RATE_LIMIT_FILE_UPLOAD_WINDOW_MS는 양의 정수여야 합니다.',
  },
  {
    name: 'RATE_LIMIT_FILE_UPLOAD_MAX_REQUESTS',
    required: false,
    description: 'File Upload Rate Limit 최대 요청 수',
    category: 'rate-limit',
    validate: (value) => !isNaN(parseInt(value)) && parseInt(value) > 0,
    validationError: 'RATE_LIMIT_FILE_UPLOAD_MAX_REQUESTS는 양의 정수여야 합니다.',
  },
];

/**
 * 환경 변수 검증 에러
 */
export class EnvValidationError extends Error {
  constructor(
    public missingVariables: EnvVariable[],
    public invalidVariables: Array<{ variable: EnvVariable; error: string }>,
  ) {
    const missingCount = missingVariables.length;
    const invalidCount = invalidVariables.length;

    let message = '환경 변수 검증 실패:\n\n';

    if (missingCount > 0) {
      message += `❌ 누락된 필수 환경 변수 (${missingCount}개):\n`;
      missingVariables.forEach((v) => {
        message += `  - ${v.name}: ${v.description}\n`;
      });
      message += '\n';
    }

    if (invalidCount > 0) {
      message += `❌ 유효하지 않은 환경 변수 (${invalidCount}개):\n`;
      invalidVariables.forEach(({ variable, error }) => {
        message += `  - ${variable.name}: ${error}\n`;
      });
      message += '\n';
    }

    message += '💡 .env.example 파일을 참고하여 .env 파일을 설정해주세요.\n';

    super(message);
    this.name = 'EnvValidationError';
  }
}

/**
 * 환경 변수 검증 실행
 *
 * @throws {EnvValidationError} 필수 환경 변수가 누락되거나 유효하지 않은 경우
 */
export function validateEnv(): void {
  const missingVariables: EnvVariable[] = [];
  const invalidVariables: Array<{ variable: EnvVariable; error: string }> = [];

  for (const envVar of ENV_VARIABLES) {
    const value = process.env[envVar.name];

    // 필수 변수 누락 체크
    if (envVar.required && !value) {
      missingVariables.push(envVar);
      continue;
    }

    // 선택 변수가 없으면 스킵
    if (!envVar.required && !value) {
      continue;
    }

    // 값이 있고 검증 함수가 있으면 검증 실행
    if (value && envVar.validate) {
      try {
        const isValid = envVar.validate(value);
        if (!isValid) {
          // 디버깅: 실제 값 정보 출력
          const debugInfo = envVar.name === 'NEXTAUTH_SECRET'
            ? ` (실제 길이: ${value.length}, 첫 20자: "${value.substring(0, 20)}")`
            : '';
          invalidVariables.push({
            variable: envVar,
            error: (envVar.validationError || '유효하지 않은 값입니다.') + debugInfo,
          });
        }
      } catch (error) {
        invalidVariables.push({
          variable: envVar,
          error: `검증 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
  }

  // 에러가 있으면 예외 발생
  if (missingVariables.length > 0 || invalidVariables.length > 0) {
    throw new EnvValidationError(missingVariables, invalidVariables);
  }
}

/**
 * 환경 변수 요약 출력 (개발 환경에서만)
 */
export function printEnvSummary(): void {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  console.log('\n📋 환경 변수 설정 현황:\n');

  const categories = Array.from(new Set(ENV_VARIABLES.map(v => v.category)));

  categories.forEach((category) => {
    const vars = ENV_VARIABLES.filter(v => v.category === category);
    const categoryName = {
      database: '데이터베이스',
      auth: '인증',
      storage: '스토리지',
      cache: '캐시',
      email: '이메일',
      queue: '큐',
      webhook: '웹훅',
      'rate-limit': 'Rate Limiting',
    }[category] || category;

    console.log(`\n${categoryName}:`);
    vars.forEach((v) => {
      const value = process.env[v.name];
      const status = value ? '✅' : v.required ? '❌' : '⚪';
      const requiredText = v.required ? '(필수)' : '(선택)';
      console.log(`  ${status} ${v.name} ${requiredText}`);
    });
  });

  console.log('\n');
}

/**
 * 환경 변수 검증 및 요약 출력
 *
 * 앱 시작 시 한 번 호출하면 됩니다.
 *
 * @example
 * ```typescript
 * // src/app/layout.tsx 또는 middleware.ts
 * import { validateAndPrintEnv } from '@/lib/env-validation';
 * validateAndPrintEnv();
 * ```
 */
export function validateAndPrintEnv(): void {
  try {
    validateEnv();
    printEnvSummary();
    console.log('✅ 환경 변수 검증 완료\n');
  } catch (error) {
    if (error instanceof EnvValidationError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}
