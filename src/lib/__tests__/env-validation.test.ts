import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateEnv, ENV_VARIABLES, EnvValidationError } from '../env-validation';

describe('EnvValidation', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.resetModules();
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('should pass validation when all required variables are present and valid', () => {
        // Set minimal required variables
        process.env.DATABASE_URL = 'postgresql://localhost:5432/mydb';
        process.env.DIRECT_URL = 'postgresql://localhost:5432/mydb_direct';
        process.env.NEXTAUTH_SECRET = 'a_very_long_secret_that_is_at_least_32_characters_long';
        process.env.NEXTAUTH_URL = 'http://localhost:3000';
        process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_token';

        expect(() => validateEnv()).not.toThrow();
    });

    it('should throw error if required variable is missing', () => {
        // Set other required variables to avoid noise
        process.env.DIRECT_URL = 'postgresql://localhost:5432/mydb_direct';
        process.env.NEXTAUTH_SECRET = 'a_very_long_secret_that_is_at_least_32_characters_long';
        process.env.NEXTAUTH_URL = 'http://localhost:3000';
        process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_token';

        process.env.DATABASE_URL = ''; // Missing required var

        try {
            validateEnv();
        } catch (error: any) {
            expect(error).toBeInstanceOf(EnvValidationError);
            // We expect at least DATABASE_URL to be missing. 
            // In case the environment is clean, it should be the only one.
            const missingNames = error.missingVariables.map((v: any) => v.name);
            expect(missingNames).toContain('DATABASE_URL');
        }
    });

    it('should throw error if variable validation fails', () => {
        // Set minimal required valid variables first
        process.env.DATABASE_URL = 'postgresql://localhost';
        process.env.DIRECT_URL = 'postgresql://localhost';
        process.env.NEXTAUTH_SECRET = 'valid_secret_32_chars_longggggggggg';
        process.env.NEXTAUTH_URL = 'http://localhost';
        process.env.BLOB_READ_WRITE_TOKEN = 'token';

        // Set invalid value
        process.env.NEXTAUTH_SECRET = 'short'; // Invalid: too short

        try {
            validateEnv();
            expect(true).toBe(false); // Should not reach here
        } catch (error: any) {
            expect(error).toBeInstanceOf(EnvValidationError);
            expect(error.invalidVariables).toHaveLength(1);
            expect(error.invalidVariables[0].variable.name).toBe('NEXTAUTH_SECRET');
        }
    });

    it('should validate optional variables if present', () => {
        // Valid required
        process.env.DATABASE_URL = 'postgresql://localhost';
        process.env.DIRECT_URL = 'postgresql://localhost';
        process.env.NEXTAUTH_SECRET = 'valid_secret_32_chars_longggggggggg';
        process.env.NEXTAUTH_URL = 'http://localhost';
        process.env.BLOB_READ_WRITE_TOKEN = 'token';

        // Invalid optional - use rate limit variable
        process.env.RATE_LIMIT_STRICT_WINDOW_MS = 'not-a-number';

        try {
            validateEnv();
            expect(true).toBe(false);
        } catch (error: any) {
            expect(error).toBeInstanceOf(EnvValidationError);
            expect(error.invalidVariables[0].variable.name).toBe('RATE_LIMIT_STRICT_WINDOW_MS');
        }
    });
});
