import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ENV_VARIABLES,
  EnvValidationError,
  printEnvSummary,
  validateAndPrintEnv,
  validateEnv,
} from '../env-validation';

describe('EnvValidation', () => {
  const originalEnv = process.env;
  const consoleSpy = {
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
  };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    consoleSpy.log.mockClear();
    consoleSpy.error.mockClear();
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
      process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_token';

      expect(() => validateEnv()).not.toThrow();
    });

    it('should throw error if required variable is missing', () => {
      process.env.DIRECT_URL = 'postgresql://localhost:5432/mydb_direct';
      process.env.NEXTAUTH_SECRET = 'a_very_long_secret_that_is_at_least_32_characters_long';
      process.env.NEXTAUTH_URL = 'http://localhost:3000';
      process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_token';
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
      process.env.BLOB_READ_WRITE_TOKEN = 'token';

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
      process.env.BLOB_READ_WRITE_TOKEN = 'token';
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
      process.env.BLOB_READ_WRITE_TOKEN = 'token';
      // No optional variables set - should pass

      expect(() => validateEnv()).not.toThrow();
    });

    it('should validate UPSTASH_REDIS_REST_URL format', () => {
      process.env.DATABASE_URL = 'postgresql://localhost';
      process.env.DIRECT_URL = 'postgresql://localhost';
      process.env.NEXTAUTH_SECRET = 'valid_secret_32_chars_longggggggggg';
      process.env.NEXTAUTH_URL = 'http://localhost';
      process.env.BLOB_READ_WRITE_TOKEN = 'token';
      process.env.UPSTASH_REDIS_REST_URL = 'http://invalid'; // Should be https

      try {
        validateEnv();
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error).toBeInstanceOf(EnvValidationError);
        expect(error.invalidVariables[0].variable.name).toBe('UPSTASH_REDIS_REST_URL');
      }
    });

    it('should validate RESEND_API_KEY format', () => {
      process.env.DATABASE_URL = 'postgresql://localhost';
      process.env.DIRECT_URL = 'postgresql://localhost';
      process.env.NEXTAUTH_SECRET = 'valid_secret_32_chars_longggggggggg';
      process.env.NEXTAUTH_URL = 'http://localhost';
      process.env.BLOB_READ_WRITE_TOKEN = 'token';
      process.env.RESEND_API_KEY = 'invalid_key'; // Should start with re_

      try {
        validateEnv();
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error).toBeInstanceOf(EnvValidationError);
        expect(error.invalidVariables[0].variable.name).toBe('RESEND_API_KEY');
      }
    });
  });

  describe('printEnvSummary', () => {
    it('should not print in production environment', () => {
      vi.stubEnv('NODE_ENV', 'production');
      printEnvSummary();
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('should print in development environment', () => {
      vi.stubEnv('NODE_ENV', 'development');
      printEnvSummary();
      expect(consoleSpy.log).toHaveBeenCalled();
    });
  });

  describe('validateAndPrintEnv', () => {
    it('should log success when validation passes', () => {
      vi.stubEnv('NODE_ENV', 'development');
      process.env.DATABASE_URL = 'postgresql://localhost';
      process.env.DIRECT_URL = 'postgresql://localhost';
      process.env.NEXTAUTH_SECRET = 'valid_secret_32_chars_longggggggggg';
      process.env.NEXTAUTH_URL = 'http://localhost';
      process.env.BLOB_READ_WRITE_TOKEN = 'token';

      validateAndPrintEnv();

      expect(consoleSpy.log).toHaveBeenCalledWith('✅ 환경 변수 검증 완료\n');
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

  describe('ENV_VARIABLES', () => {
    it('should have correct structure for all variables', () => {
      ENV_VARIABLES.forEach((envVar) => {
        expect(envVar.name).toBeDefined();
        expect(typeof envVar.required).toBe('boolean');
        expect(envVar.description).toBeDefined();
        expect(envVar.category).toBeDefined();
      });
    });
  });
});
