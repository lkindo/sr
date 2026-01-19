import { NextResponse } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

import { handleApiError } from '@/lib/api-error-handler';
import { ServiceError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';

// Mock NextResponse
vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((data, init) => ({
      data,
      status: init?.status || 200,
    })),
  },
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    logError: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('api-error-handler', () => {
  it('should handle ServiceError correctly', () => {
    const error = new ServiceError('Custom Error', 'CUSTOM_CODE', 418);
    const response = handleApiError(error) as any;

    expect(response.status).toBe(418);
    expect(response.data).toEqual({
      error: 'Custom Error',
      code: 'CUSTOM_CODE',
    });
    expect(logger.logError).toHaveBeenCalledWith(error, undefined);
  });

  it('should handle ZodError correctly', () => {
    const zodError = new ZodError([
      {
        code: 'invalid_type',
        expected: 'string',
        path: ['name'],
        message: 'Name must be a string',
      },
    ]);

    const response = handleApiError(zodError) as any;

    expect(response.status).toBe(400);
    expect(response.data.code).toBe('VALIDATION_ERROR');
    expect(response.data.error).toBe('Name must be a string');
    expect(logger.warn).toHaveBeenCalled();
  });

  it('should handle generic Error correctly', () => {
    const error = new Error('Unexpected Boom');
    const response = handleApiError(error) as any;

    expect(response.status).toBe(500);
    expect(response.data.code).toBe('INTERNAL_ERROR');
    expect(logger.error).toHaveBeenCalledWith('Unexpected error', error, undefined);
  });

  it('should handle unknown error types', () => {
    const response = handleApiError('String Error') as any;

    expect(response.status).toBe(500);
    expect(response.data.code).toBe('UNKNOWN_ERROR');
    expect(logger.error).toHaveBeenCalledWith('Unknown error', undefined, expect.any(Object));
  });
});
