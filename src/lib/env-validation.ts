import { logger } from '@/lib/logger';
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
  category: 'database' | 'auth' | 'storage' | 'email' | 'rate-limit' | 'push';

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
 * 값 정규화
 *
 * 앞뒤 공백과 값을 감싼 따옴표를 제거한다.
 * docker-compose 의 `env_file` 은 따옴표를 벗겨주지 않는 경우가 있어서
 * 실제 배포 값이 `"..."` 로 들어올 수 있다(src/lib/app-url.ts 도 같은 이유로 방어한다).
 * 이 방어가 없으면 정상 값이 검증에 실패해 컨테이너가 크래시 루프에 빠진다.
 */
function normalizeValue(value: string): string {
  return value
    .trim()
    .replace(/^(['"`])([\s\S]*)\1$/, '$2')
    .trim();
}

/**
 * 플레이스홀더 판별 패턴
 *
 * .env.example / .env.docker* 템플릿에 실제로 들어 있는 형태만 잡는다.
 * 실제 시크릿을 오탐하면 부팅이 막히므로 반드시 앵커를 걸어 보수적으로 유지한다.
 * (44자 base64 서명 키, postgresql:// URL, 87자 base64url VAPID 키, Gmail 앱 비밀번호는 모두 통과해야 한다)
 */
const PLACEHOLDER_PATTERNS: RegExp[] = [
  // your_vapid_public_key_here, your_app_password_here, your_email@gmail.com, your-redis-url...
  /^your[_-]/,
  // ..._here 로 끝나는 템플릿 값
  /[_-]here$/,
  // change_me_to_random_secret_string, changeme...
  /^change[_-]?me/,
  // vercel_blob_rw_change_me
  /[_-]change[_-]?me$/,
  // 단독 토큰형 플레이스홀더
  /^(placeholder|changeme|replaceme|todo|tbd|xxx)$/,
];

/**
 * 환경 변수 값이 템플릿 플레이스홀더인지 판별한다.
 *
 * 빈 문자열/공백만 있는 값도 "설정되지 않음"으로 본다.
 * 진짜 시크릿을 절대 오탐하지 않는 것이 이 함수의 유일한 계약이다.
 *
 * @example
 * ```typescript
 * isPlaceholderValue('your_app_password_here'); // true
 * isPlaceholderValue('postgresql://user:pw@db:5432/sr'); // false
 * ```
 */
export function isPlaceholderValue(value: string): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = normalizeValue(value).toLowerCase();

  if (normalized.length === 0) {
    return true;
  }

  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * base64url(및 표준 base64) 키 길이 검증 헬퍼
 *
 * 패딩(`=`)과 감싼 따옴표는 제거한 뒤 길이만 확인한다.
 * 알파벳을 넉넉하게 잡는 이유는, 정상 배포 값을 실패로 판정해 부팅을 막는 위험이
 * 오탐을 놓치는 위험보다 훨씬 크기 때문이다.
 */
function isBase64Key(value: string, minLength: number, maxLength: number): boolean {
  const key = normalizeValue(value).replace(/=+$/, '');
  return key.length >= minLength && key.length <= maxLength && /^[A-Za-z0-9_\-+/]+$/.test(key);
}

/**
 * 환경 변수 정의
 */
/**
 * 양의 정수를 요구하는 선택적 환경 변수 하나를 만든다.
 *
 * 레이트리밋 설정 10개가 같은 6줄(required/category/validate/validationError)을
 * 이름과 설명만 바꿔 반복하고 있었다. 검증 규칙이 한 곳에 있어야 새 변수를 더할 때
 * `> 0` 을 빠뜨리는 일이 생기지 않는다.
 */
function positiveIntegerVar(name: string, description: string): EnvVariable {
  return {
    name,
    required: false,
    description,
    category: 'rate-limit',
    validate: (value) => !isNaN(parseInt(value)) && parseInt(value) > 0,
    validationError: `${name}는 양의 정수여야 합니다.`,
  };
}

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
    // Auth.js v5 가 라이브러리 내부에서 직접 읽는다(앱 코드에는 process.env.AUTH_SECRET 참조가 없다).
    // 값이 있을 때만 검증하며, 없다고 부팅을 막지는 않는다(NEXTAUTH_SECRET 로도 동작한다).
    name: 'AUTH_SECRET',
    required: false,
    description: 'Auth.js v5 세션 암호화 시크릿 (최소 32자, NEXTAUTH_SECRET 과 동일 값)',
    category: 'auth',
    validate: (value) => normalizeValue(value).length >= 32,
    validationError: 'AUTH_SECRET은 최소 32자 이상이어야 합니다.',
  },
  {
    name: 'NEXTAUTH_URL',
    required: false,
    description: 'NextAuth 콜백 URL',
    category: 'auth',
    validate: (value) => value.startsWith('http://') || value.startsWith('https://'),
    validationError: 'NEXTAUTH_URL은 http:// 또는 https:// 로 시작해야 합니다.',
  },
  {
    // src/lib/app-url.ts 에서 읽는다.
    name: 'NEXT_PUBLIC_APP_URL',
    required: false,
    description: '앱 공개 기본 URL (알림 링크 등에 사용)',
    category: 'auth',
    validate: (value) => {
      const url = normalizeValue(value);
      return url.startsWith('http://') || url.startsWith('https://');
    },
    validationError: 'NEXT_PUBLIC_APP_URL은 http:// 또는 https:// 로 시작해야 합니다.',
  },

  // Rate Limiting (선택사항)
  positiveIntegerVar('RATE_LIMIT_STRICT_WINDOW_MS', 'Strict Rate Limit 윈도우 (밀리초)'),
  positiveIntegerVar('RATE_LIMIT_STRICT_MAX_REQUESTS', 'Strict Rate Limit 최대 요청 수'),
  positiveIntegerVar('RATE_LIMIT_STANDARD_WINDOW_MS', 'Standard Rate Limit 윈도우 (밀리초)'),
  positiveIntegerVar('RATE_LIMIT_STANDARD_MAX_REQUESTS', 'Standard Rate Limit 최대 요청 수'),
  positiveIntegerVar('RATE_LIMIT_RELAXED_WINDOW_MS', 'Relaxed Rate Limit 윈도우 (밀리초)'),
  positiveIntegerVar('RATE_LIMIT_RELAXED_MAX_REQUESTS', 'Relaxed Rate Limit 최대 요청 수'),
  positiveIntegerVar('RATE_LIMIT_FILE_UPLOAD_WINDOW_MS', 'File Upload Rate Limit 윈도우 (밀리초)'),
  positiveIntegerVar('RATE_LIMIT_FILE_UPLOAD_MAX_REQUESTS', 'File Upload Rate Limit 최대 요청 수'),
  positiveIntegerVar('RATE_LIMIT_MIDDLEWARE_WINDOW_MS', 'Middleware Rate Limit 윈도우 (밀리초)'),
  positiveIntegerVar('RATE_LIMIT_MIDDLEWARE_MAX_REQUESTS', 'Middleware Rate Limit 최대 요청 수'),

  // Web Push (선택사항)
  // 키가 없거나 플레이스홀더면 푸시는 "미설정"으로 동작해야 한다. 절대 부팅을 막지 않는다.
  {
    // src/services/push.service.ts, src/app/api/push/vapid-key/route.ts, src/hooks/use-push-notifications.ts 에서 읽는다.
    name: 'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
    required: false,
    description: 'Web Push VAPID 공개 키 (base64url 87자)',
    category: 'push',
    validate: (value) => isBase64Key(value, 87, 88),
    validationError: 'NEXT_PUBLIC_VAPID_PUBLIC_KEY는 base64url 형식의 87~88자여야 합니다.',
  },
  {
    // src/services/push.service.ts 에서 읽는다.
    name: 'VAPID_PRIVATE_KEY',
    required: false,
    description: 'Web Push VAPID 비밀 키 (base64url 43자, 공개 키와 반드시 한 쌍)',
    category: 'push',
    validate: (value) => isBase64Key(value, 43, 44),
    validationError: 'VAPID_PRIVATE_KEY는 base64url 형식의 43~44자여야 합니다.',
  },
  {
    // src/services/push.service.ts 에서 읽는다.
    name: 'VAPID_SUBJECT',
    required: false,
    description: 'Web Push VAPID subject (mailto: 또는 https:// URL)',
    category: 'push',
    validate: (value) => {
      const subject = normalizeValue(value);
      return subject.startsWith('mailto:') || subject.startsWith('https://');
    },
    validationError: 'VAPID_SUBJECT는 mailto: 또는 https:// 로 시작해야 합니다.',
  },

  // Email (선택사항)
  // src/services/email.service.ts 에서 읽는다. 자격 증명이 없으면 메일 발송을 건너뛴다.
  {
    name: 'EMAIL_SERVER_HOST',
    required: false,
    description: 'SMTP 서버 호스트',
    category: 'email',
    validate: (value) => normalizeValue(value).length > 0,
    validationError: 'EMAIL_SERVER_HOST는 비어 있을 수 없습니다.',
  },
  {
    name: 'EMAIL_SERVER_PORT',
    required: false,
    description: 'SMTP 서버 포트',
    category: 'email',
    validate: (value) => {
      const port = Number(normalizeValue(value));
      return Number.isInteger(port) && port > 0 && port <= 65535;
    },
    validationError: 'EMAIL_SERVER_PORT는 1~65535 사이의 정수여야 합니다.',
  },
  {
    name: 'EMAIL_SERVER_USER',
    required: false,
    description: 'SMTP 계정 (미설정 시 메일 발송 비활성화)',
    category: 'email',
    validate: (value) => normalizeValue(value).length > 0,
    validationError: 'EMAIL_SERVER_USER는 비어 있을 수 없습니다.',
  },
  {
    name: 'EMAIL_SERVER_PASSWORD',
    required: false,
    description: 'SMTP 앱 비밀번호 (미설정 시 메일 발송 비활성화)',
    category: 'email',
    validate: (value) => normalizeValue(value).length > 0,
    validationError: 'EMAIL_SERVER_PASSWORD는 비어 있을 수 없습니다.',
  },
  {
    name: 'EMAIL_FROM',
    required: false,
    description: '발신자 주소',
    category: 'email',
    validate: (value) => normalizeValue(value).length > 0,
    validationError: 'EMAIL_FROM은 비어 있을 수 없습니다.',
  },
];

/**
 * 환경 변수 검증 에러
 */
export class EnvValidationError extends Error {
  constructor(
    public missingVariables: EnvVariable[],
    public invalidVariables: Array<{ variable: EnvVariable; error: string }>
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

    // 템플릿 플레이스홀더 체크 (값은 있지만 .env.example 그대로인 경우)
    //
    // - 필수 변수: 누락과 동일하게 치명적으로 처리한다. "설정된 척"이 바로 우리가 잡으려는 버그다.
    // - 선택 변수: 경고만 남기고 "미설정"으로 간주한다. 여기서 프로세스를 죽이면
    //   플레이스홀더 EMAIL_SERVER_USER/PASSWORD 를 그대로 들고 있는 스테이징 컨테이너가
    //   restart: always 와 맞물려 영구 크래시 루프에 빠진다.
    //
    // 어떤 경우에도 값 자체는 로그에 남기지 않는다. 변수 이름과 설명만 출력한다.
    if (value && isPlaceholderValue(value)) {
      if (envVar.required) {
        invalidVariables.push({
          variable: envVar,
          error: '템플릿 플레이스홀더 값이 그대로 남아 있습니다. 실제 값으로 교체해주세요.',
        });
      } else {
        logger.warn(
          `⚠️  ${envVar.name}: 플레이스홀더 값이 감지되어 "미설정"으로 간주합니다. ` +
            `관련 기능이 동작하지 않습니다 (${envVar.description})`
        );
      }
      continue;
    }

    // 값이 있고 검증 함수가 있으면 검증 실행
    if (value && envVar.validate) {
      try {
        const isValid = envVar.validate(value);
        if (!isValid) {
          // 디버깅: 길이만 출력(시크릿 값 일부도 로그에 남기지 않는다)
          const debugInfo =
            envVar.name === 'NEXTAUTH_SECRET' ? ` (실제 길이: ${value.length})` : '';
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

  logger.info('\n📋 환경 변수 설정 현황:\n');

  const categories = Array.from(new Set(ENV_VARIABLES.map((v) => v.category)));

  categories.forEach((category) => {
    const vars = ENV_VARIABLES.filter((v) => v.category === category);
    const categoryName =
      {
        database: '데이터베이스',
        auth: '인증',
        storage: '스토리지',
        email: '이메일',
        'rate-limit': 'Rate Limiting',
        push: '푸시 알림',
      }[category] || category;

    logger.info(`\n${categoryName}:`);
    vars.forEach((v) => {
      const value = process.env[v.name];
      // 플레이스홀더를 ✅ 로 표시하면 요약 자체가 거짓말이 된다.
      const isPlaceholder = !!value && isPlaceholderValue(value);
      const status = isPlaceholder ? '⚠️' : value ? '✅' : v.required ? '❌' : '⚪';
      const requiredText = v.required ? '(필수)' : '(선택)';
      const placeholderText = isPlaceholder ? ' - 플레이스홀더(미설정으로 간주)' : '';
      logger.info(`  ${status} ${v.name} ${requiredText}${placeholderText}`);
    });
  });

  logger.info('\n');
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
    logger.info('✅ 환경 변수 검증 완료\n');
  } catch (error) {
    if (error instanceof EnvValidationError) {
      logger.error(error.message, error);
      process.exit(1);
    }
    throw error;
  }
}
