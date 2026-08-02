import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logger } from '@/lib/logger';

import {
  ENV_VARIABLES,
  EnvValidationError,
  isPlaceholderValue,
  printEnvSummary,
  validateAndPrintEnv,
  validateEnv,
} from '../env-validation';

/**
 * 실제 배포 값과 같은 "모양"의 테스트 픽스처.
 * 값 자체는 이 테스트를 위해 새로 생성한 난수이며 어떤 환경에서도 사용되지 않는다.
 */
const REAL_SIGNING_SECRET = 'OzpF9kevw3wiI98v1ENQoQuNuj/ecWbSob5jon1TJdU='; // 44자 base64
const REAL_VAPID_PUBLIC_KEY =
  'BaqaJkWeSl2fYvhgrowWs5V649dFccSCgX53_TFdIosNmu7rasszEdmKwsjLIG2LxGiF2NH0-Z5u7boByg5afWE'; // 87자 base64url
const REAL_VAPID_PRIVATE_KEY = 'RXre7V8g0ZWpAm86wILKq1I0VYxNhYUJGX_Xu3z1e5s'; // 43자 base64url
const REAL_GMAIL_APP_PASSWORD = 'abcd efgh ijkl mnop'; // 19자 Gmail 앱 비밀번호

describe('EnvValidation', () => {
  const originalEnv = process.env;
  const loggerSpy = {
    info: vi.spyOn(logger, 'info').mockImplementation(() => {}),
    warn: vi.spyOn(logger, 'warn').mockImplementation(() => {}),
    error: vi.spyOn(logger, 'error').mockImplementation(() => {}),
  };

  /**
   * vitest.setup.ts 가 미리 넣어둔 값이 섞이지 않도록,
   * 이 모듈이 관리하는 환경 변수를 전부 지우고 원하는 집합만 세팅한다.
   */
  const setEnv = (vars: Record<string, string>) => {
    ENV_VARIABLES.forEach((v) => {
      delete process.env[v.name];
    });
    Object.entries(vars).forEach(([key, value]) => {
      process.env[key] = value;
    });
  };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    loggerSpy.info.mockClear();
    loggerSpy.warn.mockClear();
    loggerSpy.error.mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('validateEnv', () => {
    it('should pass validation when all required variables are present and valid', () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/mydb';
      process.env.DIRECT_URL = 'postgresql://localhost:5432/mydb_direct';
      process.env.NEXTAUTH_SECRET = 'a_very_long_secret_that_is_at_least_32_characters_long';
      process.env.NEXTAUTH_URL = 'http://localhost:3000';

      expect(() => validateEnv()).not.toThrow();
    });

    it('should throw error if required variable is missing', () => {
      process.env.DIRECT_URL = 'postgresql://localhost:5432/mydb_direct';
      process.env.NEXTAUTH_SECRET = 'a_very_long_secret_that_is_at_least_32_characters_long';
      process.env.NEXTAUTH_URL = 'http://localhost:3000';

      process.env.DATABASE_URL = '';

      try {
        validateEnv();
      } catch (error: any) {
        expect(error).toBeInstanceOf(EnvValidationError);
        const missingNames = error.missingVariables.map((v: any) => v.name);
        expect(missingNames).toContain('DATABASE_URL');
      }
    });

    it('should throw error if variable validation fails', () => {
      process.env.DATABASE_URL = 'postgresql://localhost';
      process.env.DIRECT_URL = 'postgresql://localhost';
      process.env.NEXTAUTH_SECRET = 'short'; // Too short, invalid
      process.env.NEXTAUTH_URL = 'http://localhost';

      try {
        validateEnv();
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error).toBeInstanceOf(EnvValidationError);
        expect(error.invalidVariables).toHaveLength(1);
        expect(error.invalidVariables[0].variable.name).toBe('NEXTAUTH_SECRET');
      }
    });

    it('should validate optional variables if present', () => {
      process.env.DATABASE_URL = 'postgresql://localhost';
      process.env.DIRECT_URL = 'postgresql://localhost';
      process.env.NEXTAUTH_SECRET = 'valid_secret_32_chars_longggggggggg';
      process.env.NEXTAUTH_URL = 'http://localhost';

      process.env.RATE_LIMIT_STRICT_WINDOW_MS = 'not-a-number';

      try {
        validateEnv();
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error).toBeInstanceOf(EnvValidationError);
        expect(error.invalidVariables[0].variable.name).toBe('RATE_LIMIT_STRICT_WINDOW_MS');
      }
    });

    it('should skip optional variables when not present', () => {
      process.env.DATABASE_URL = 'postgresql://localhost';
      process.env.DIRECT_URL = 'postgresql://localhost';
      process.env.NEXTAUTH_SECRET = 'valid_secret_32_chars_longggggggggg';
      process.env.NEXTAUTH_URL = 'http://localhost';

      // No optional variables set - should pass

      expect(() => validateEnv()).not.toThrow();
    });
  });

  describe('printEnvSummary', () => {
    it('should not print in production environment', () => {
      vi.stubEnv('NODE_ENV', 'production');
      printEnvSummary();
      expect(loggerSpy.info).not.toHaveBeenCalled();
    });

    it('should print in development environment', () => {
      vi.stubEnv('NODE_ENV', 'development');
      printEnvSummary();
      expect(loggerSpy.info).toHaveBeenCalled();
    });
  });

  describe('validateAndPrintEnv', () => {
    it('should log success when validation passes', () => {
      vi.stubEnv('NODE_ENV', 'development');
      process.env.DATABASE_URL = 'postgresql://localhost';
      process.env.DIRECT_URL = 'postgresql://localhost';
      process.env.NEXTAUTH_SECRET = 'valid_secret_32_chars_longggggggggg';
      process.env.NEXTAUTH_URL = 'http://localhost';

      validateAndPrintEnv();

      expect(loggerSpy.info).toHaveBeenCalledWith('✅ 환경 변수 검증 완료\n');
    });
  });

  describe('EnvValidationError', () => {
    it('should format error message correctly with missing variables', () => {
      const error = new EnvValidationError(
        [{ name: 'TEST_VAR', required: true, description: 'Test variable', category: 'database' }],
        []
      );
      expect(error.message).toContain('누락된 필수 환경 변수');
      expect(error.message).toContain('TEST_VAR');
    });

    it('should format error message correctly with invalid variables', () => {
      const error = new EnvValidationError(
        [],
        [
          {
            variable: { name: 'TEST_VAR', required: true, description: 'Test', category: 'auth' },
            error: 'Invalid format',
          },
        ]
      );
      expect(error.message).toContain('유효하지 않은 환경 변수');
      expect(error.message).toContain('Invalid format');
    });

    it('should format error message with both missing and invalid variables', () => {
      const error = new EnvValidationError(
        [{ name: 'MISSING_VAR', required: true, description: 'Missing', category: 'database' }],
        [
          {
            variable: {
              name: 'INVALID_VAR',
              required: true,
              description: 'Invalid',
              category: 'auth',
            },
            error: 'Bad value',
          },
        ]
      );
      expect(error.message).toContain('누락된 필수 환경 변수');
      expect(error.message).toContain('유효하지 않은 환경 변수');
    });
  });

  describe('isPlaceholderValue', () => {
    it.each([
      ['your_vapid_public_key_here'],
      ['your_vapid_private_key_here'],
      ['your_app_password_here'],
      ['your_email@gmail.com'],
      ['your_redis_token_here'],
      ['change_me_to_random_secret_string'],
      ['change_me_db_user'],
      ['vercel_blob_rw_change_me'],
      ['"your_app_password_here"'],
      [''],
      ['   '],
    ])('should detect %s as a placeholder', (value) => {
      expect(isPlaceholderValue(value)).toBe(true);
    });

    it.each([
      ['44자 base64 서명 키', REAL_SIGNING_SECRET],
      ['postgresql URL', 'postgresql://sr_user:9f3a1c@db:5432/sr_db'],
      ['87자 base64url VAPID 공개 키', REAL_VAPID_PUBLIC_KEY],
      ['43자 base64url VAPID 비밀 키', REAL_VAPID_PRIVATE_KEY],
      ['Gmail 앱 비밀번호', REAL_GMAIL_APP_PASSWORD],
      ['https 앱 URL', 'https://sr.lkindo.kr'],
      ['mailto subject', 'mailto:lkindo@gmail.com'],
      ['SMTP 호스트', 'smtp.gmail.com'],
      ['발신자 주소', 'SR System <no-reply@sr-system.com>'],
      ['포트', '587'],
    ])('should never flag a legitimate %s as a placeholder', (_label, value) => {
      expect(isPlaceholderValue(value)).toBe(false);
    });

    it('should stay conservative and NOT treat a your- prefixed hostname as a placeholder', () => {
      // .env.example 의 UPSTASH_REDIS_REST_URL="https://your-redis-url.upstash.io" 는 잡지 못한다.
      // 의도된 선택이다: `your-` 로 시작하는 호스트명은 실제로 존재할 수 있고,
      // 정상 값을 오탐하는 쪽이 플레이스홀더를 놓치는 쪽보다 훨씬 위험하다.
      // 해당 변수는 ENV_VARIABLES 에 등록되어 있지도 않다.
      expect(isPlaceholderValue('https://your-redis-url.upstash.io')).toBe(false);
    });
  });

  describe('placeholder severity split', () => {
    it('should throw EnvValidationError when a REQUIRED variable holds a placeholder', () => {
      setEnv({
        DATABASE_URL: 'postgresql://sr_user:9f3a1c@db:5432/sr_db',
        DIRECT_URL: 'postgresql://sr_user:9f3a1c@db:5432/sr_db',
        // .env.example 그대로인 값: 32자를 넘기 때문에 길이 검증만으로는 통과해버린다.
        NEXTAUTH_SECRET: 'change_me_to_random_secret_string',
      });

      expect(() => validateEnv()).toThrow(EnvValidationError);

      try {
        validateEnv();
      } catch (error: any) {
        expect(error.invalidVariables[0].variable.name).toBe('NEXTAUTH_SECRET');
        expect(error.invalidVariables[0].error).toContain('플레이스홀더');
      }
    });

    it('should NOT throw when an OPTIONAL variable holds a placeholder, but must warn', () => {
      setEnv({
        DATABASE_URL: 'postgresql://sr_user:9f3a1c@db:5432/sr_db',
        DIRECT_URL: 'postgresql://sr_user:9f3a1c@db:5432/sr_db',
        NEXTAUTH_SECRET: REAL_SIGNING_SECRET,
        EMAIL_SERVER_PASSWORD: 'your_app_password_here',
      });

      expect(() => validateEnv()).not.toThrow();

      const warning = loggerSpy.warn.mock.calls.map((call) => call[0]).join('\n');
      expect(warning).toContain('EMAIL_SERVER_PASSWORD');
      expect(warning).toContain('플레이스홀더');
    });

    it('should never echo the offending value in the placeholder warning', () => {
      setEnv({
        DATABASE_URL: 'postgresql://sr_user:9f3a1c@db:5432/sr_db',
        DIRECT_URL: 'postgresql://sr_user:9f3a1c@db:5432/sr_db',
        NEXTAUTH_SECRET: REAL_SIGNING_SECRET,
        EMAIL_SERVER_USER: 'your_email@gmail.com',
      });

      validateEnv();

      const logged = JSON.stringify(loggerSpy.warn.mock.calls);
      expect(logged).toContain('EMAIL_SERVER_USER');
      expect(logged).not.toContain('your_email@gmail.com');
    });
  });

  describe('real-world value shapes', () => {
    it('should accept every legitimate value shape used in the deployed environments', () => {
      setEnv({
        DATABASE_URL: 'postgresql://sr_user:9f3a1c@db:5432/sr_db',
        DIRECT_URL: 'postgresql://sr_user:9f3a1c@db:5432/sr_db',
        NEXTAUTH_SECRET: REAL_SIGNING_SECRET,
        AUTH_SECRET: REAL_SIGNING_SECRET,
        NEXTAUTH_URL: 'https://sr.lkindo.kr',
        NEXT_PUBLIC_APP_URL: 'https://sr.lkindo.kr',
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: REAL_VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY: REAL_VAPID_PRIVATE_KEY,
        VAPID_SUBJECT: 'mailto:lkindo@gmail.com',
      });

      expect(() => validateEnv()).not.toThrow();
      expect(loggerSpy.warn).not.toHaveBeenCalled();
    });

    it('should tolerate values that arrive still wrapped in quotes from env_file', () => {
      setEnv({
        DATABASE_URL: 'postgresql://sr_user:9f3a1c@db:5432/sr_db',
        DIRECT_URL: 'postgresql://sr_user:9f3a1c@db:5432/sr_db',
        NEXTAUTH_SECRET: REAL_SIGNING_SECRET,
        NEXT_PUBLIC_APP_URL: `"https://sr.lkindo.kr"`,
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: `"${REAL_VAPID_PUBLIC_KEY}"`,
        VAPID_PRIVATE_KEY: `"${REAL_VAPID_PRIVATE_KEY}"`,
      });

      expect(() => validateEnv()).not.toThrow();
    });

    it('should reject a VAPID public key of the wrong length when it is not a placeholder', () => {
      setEnv({
        DATABASE_URL: 'postgresql://sr_user:9f3a1c@db:5432/sr_db',
        DIRECT_URL: 'postgresql://sr_user:9f3a1c@db:5432/sr_db',
        NEXTAUTH_SECRET: REAL_SIGNING_SECRET,
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'tooShortToBeAVapidKey',
      });

      expect(() => validateEnv()).toThrow(EnvValidationError);
    });
  });

  describe('deployed environment regression', () => {
    it('must NOT crash-loop STAGING: real secrets + placeholder EMAIL_SERVER_USER/PASSWORD boots', () => {
      // /home/opc/sr/.env.docker.test 의 실제 상태를 그대로 재현한다.
      // 이 집합에서 예외가 나면 스테이징 컨테이너가 restart: always 와 맞물려 영구 크래시 루프에 빠진다.
      setEnv({
        DATABASE_URL: 'postgresql://sr_user:9f3a1c@db-test:5432/sr_db_test',
        DIRECT_URL: 'postgresql://sr_user:9f3a1c@db-test:5432/sr_db_test',
        NEXTAUTH_SECRET: REAL_SIGNING_SECRET,
        AUTH_SECRET: REAL_SIGNING_SECRET,
        NEXTAUTH_URL: 'https://test.lkindo.kr',
        NEXT_PUBLIC_APP_URL: 'https://test.lkindo.kr',
        AUTH_TRUST_HOST: 'true',
        EMAIL_SERVER_HOST: 'smtp.gmail.com',
        EMAIL_SERVER_PORT: '587',
        EMAIL_SERVER_USER: 'your_email@gmail.com', // 플레이스홀더 (실제 스테이징 상태)
        EMAIL_SERVER_PASSWORD: 'your_app_password_here', // 플레이스홀더 (실제 스테이징 상태)
        EMAIL_FROM: 'SR System Test <no-reply@sr-system.com>',
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: REAL_VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY: REAL_VAPID_PRIVATE_KEY,
        VAPID_SUBJECT: 'mailto:lkindo@gmail.com',
        RATE_LIMIT_STRICT_WINDOW_MS: '60000',
        RATE_LIMIT_STRICT_MAX_REQUESTS: '10',
        RATE_LIMIT_STANDARD_WINDOW_MS: '60000',
        RATE_LIMIT_STANDARD_MAX_REQUESTS: '100',
        RATE_LIMIT_RELAXED_WINDOW_MS: '60000',
        RATE_LIMIT_RELAXED_MAX_REQUESTS: '300',
        RATE_LIMIT_FILE_UPLOAD_WINDOW_MS: '3600000',
        RATE_LIMIT_FILE_UPLOAD_MAX_REQUESTS: '20',
        RATE_LIMIT_MIDDLEWARE_WINDOW_MS: '60000',
        RATE_LIMIT_MIDDLEWARE_MAX_REQUESTS: '20',
      });

      expect(() => validateEnv()).not.toThrow();

      // 부팅은 되지만, 메일이 동작하지 않는다는 사실은 반드시 크게 알려야 한다.
      const warned = loggerSpy.warn.mock.calls.map((call) => call[0]).join('\n');
      expect(warned).toContain('EMAIL_SERVER_USER');
      expect(warned).toContain('EMAIL_SERVER_PASSWORD');
    });

    it('must NOT crash-loop PRODUCTION: the fully configured set boots with no warnings', () => {
      // /home/opc/sr/.env.docker 의 실제 상태 (플레이스홀더 0개).
      setEnv({
        DATABASE_URL: 'postgresql://sr_user:9f3a1c@db:5432/sr_db',
        DIRECT_URL: 'postgresql://sr_user:9f3a1c@db:5432/sr_db',
        NEXTAUTH_SECRET: REAL_SIGNING_SECRET,
        AUTH_SECRET: REAL_SIGNING_SECRET,
        NEXTAUTH_URL: 'https://sr.lkindo.kr',
        NEXT_PUBLIC_APP_URL: 'https://sr.lkindo.kr',
        AUTH_TRUST_HOST: 'true',
        EMAIL_SERVER_HOST: 'smtp.gmail.com',
        EMAIL_SERVER_PORT: '587',
        EMAIL_SERVER_USER: 'lkindo@gmail.com',
        EMAIL_SERVER_PASSWORD: REAL_GMAIL_APP_PASSWORD,
        EMAIL_FROM: 'SR System <no-reply@sr-system.com>',
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: REAL_VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY: REAL_VAPID_PRIVATE_KEY,
        VAPID_SUBJECT: 'mailto:lkindo@gmail.com',
        RATE_LIMIT_STRICT_WINDOW_MS: '60000',
        RATE_LIMIT_STRICT_MAX_REQUESTS: '5',
        RATE_LIMIT_STANDARD_WINDOW_MS: '60000',
        RATE_LIMIT_STANDARD_MAX_REQUESTS: '100',
        RATE_LIMIT_RELAXED_WINDOW_MS: '60000',
        RATE_LIMIT_RELAXED_MAX_REQUESTS: '300',
        RATE_LIMIT_FILE_UPLOAD_WINDOW_MS: '3600000',
        RATE_LIMIT_FILE_UPLOAD_MAX_REQUESTS: '20',
        RATE_LIMIT_MIDDLEWARE_WINDOW_MS: '60000',
        RATE_LIMIT_MIDDLEWARE_MAX_REQUESTS: '20',
      });

      expect(() => validateEnv()).not.toThrow();
      expect(loggerSpy.warn).not.toHaveBeenCalled();
    });
  });

  describe('ENV_VARIABLES', () => {
    it('should have correct structure for all variables', () => {
      ENV_VARIABLES.forEach((envVar) => {
        expect(envVar.name).toBeDefined();
        expect(typeof envVar.required).toBe('boolean');
        expect(envVar.description).toBeDefined();
        expect(envVar.category).toBeDefined();
      });
    });

    it('should keep every newly registered variable optional so none can block boot', () => {
      const newlyRegistered = [
        'AUTH_SECRET',
        'NEXT_PUBLIC_APP_URL',
        'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
        'VAPID_PRIVATE_KEY',
        'VAPID_SUBJECT',
        'EMAIL_SERVER_HOST',
        'EMAIL_SERVER_PORT',
        'EMAIL_SERVER_USER',
        'EMAIL_SERVER_PASSWORD',
        'EMAIL_FROM',
      ];

      newlyRegistered.forEach((name) => {
        const envVar = ENV_VARIABLES.find((v) => v.name === name);
        expect(envVar, `${name} 가 등록되어 있어야 합니다.`).toBeDefined();
        expect(envVar?.required, `${name} 는 선택 변수여야 합니다.`).toBe(false);
      });
    });

    it('should not register STORAGE_DIR (docker-compose environment 로 주입된다)', () => {
      expect(ENV_VARIABLES.find((v) => v.name === 'STORAGE_DIR')).toBeUndefined();
    });
  });
});
