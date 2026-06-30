import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ServiceError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';

/**
 * Coverage-focused tests for src/lib/logger.ts
 *
 * The default Vitest environment is jsdom, which means `window` is defined and
 * NODE_ENV === 'test'. In that mode the Logger uses the console-based output
 * path and `shouldLog` always returns true (isDevelopment). For the production /
 * Pino branches we re-import the module via vi.resetModules() after mutating
 * process.env and deleting the global `window`.
 */

describe('logger (development/test environment - console path)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('info() uses console.info and includes the message and empty context object', () => {
    logger.info('hello info');
    expect(infoSpy).toHaveBeenCalledTimes(1);
    const [text, ctx] = infoSpy.mock.calls[0];
    expect(text).toContain('[INFO]');
    expect(text).toContain('hello info');
    expect(ctx).toEqual({});
  });

  it('info() passes provided context through', () => {
    logger.info('with ctx', { userId: 'u1', srId: 's1' });
    const [, ctx] = infoSpy.mock.calls[0];
    expect(ctx).toEqual({ userId: 'u1', srId: 's1' });
  });

  it('warn() uses console.warn', () => {
    logger.warn('careful');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('[WARN]');
    expect(warnSpy.mock.calls[0][0]).toContain('careful');
  });

  it('debug() uses console.log (no error/context branch)', () => {
    logger.debug('a debug line', { custom_x: 1 });
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('[DEBUG]');
    expect(logSpy.mock.calls[0][1]).toEqual({ custom_x: 1 });
  });

  it('error() without an Error object uses console.error and no error payload', () => {
    logger.error('plain error message');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    // No Error object => the "else" (logMethod) branch is taken, second arg is context {}
    const call = errorSpy.mock.calls[0];
    expect(call[0]).toContain('[ERROR]');
    expect(call[0]).toContain('plain error message');
    expect(call[1]).toEqual({});
  });

  it('error() with a plain Error logs the error payload (name/message/stack)', () => {
    const err = new Error('boom');
    logger.error('something failed', err, { requestId: 'r1' });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [text, errorPayload, context] = errorSpy.mock.calls[0];
    expect(text).toContain('something failed');
    expect(errorPayload).toMatchObject({ name: 'Error', message: 'boom' });
    expect(errorPayload).toHaveProperty('stack');
    // Plain Error => no code/statusCode fields
    expect(errorPayload).not.toHaveProperty('code');
    expect(errorPayload).not.toHaveProperty('statusCode');
    expect(context).toEqual({ requestId: 'r1' });
  });

  it('error() with a ServiceError includes code and statusCode', () => {
    const svcErr = new ServiceError('svc failed', 'CUSTOM_CODE', 503);
    logger.error('service blew up', svcErr);
    const [, errorPayload] = errorSpy.mock.calls[0];
    expect(errorPayload).toMatchObject({
      name: 'ServiceError',
      message: 'svc failed',
      code: 'CUSTOM_CODE',
      statusCode: 503,
    });
  });

  it('logError() forwards a ServiceError to error() using its message', () => {
    const verr = new ValidationError('invalid input', { field: 'email' });
    logger.logError(verr, { userId: 'u9' });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [text, errorPayload, context] = errorSpy.mock.calls[0];
    expect(text).toContain('invalid input');
    expect(errorPayload).toMatchObject({
      name: 'ValidationError',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
    });
    expect(context).toEqual({ userId: 'u9' });
  });

  it('createLogEntry omits context when it is empty (info path)', () => {
    logger.info('no ctx', {});
    // empty context => entry.context not set => output passes {} fallback
    expect(infoSpy.mock.calls[0][1]).toEqual({});
  });

  it('logRequest() chooses info for 2xx', () => {
    logger.logRequest('GET', '/api/items', 200, 12);
    expect(infoSpy).toHaveBeenCalledTimes(1);
    const [text, ctx] = infoSpy.mock.calls[0];
    expect(text).toContain('GET /api/items - 200 (12ms)');
    expect(ctx).toMatchObject({
      custom_method: 'GET',
      custom_path: '/api/items',
      custom_statusCode: 200,
      custom_duration: 12,
    });
  });

  it('logRequest() chooses warn for 4xx and omits duration when not provided', () => {
    logger.logRequest('POST', '/api/x', 404);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const text = warnSpy.mock.calls[0][0];
    expect(text).toContain('POST /api/x - 404');
    expect(text).not.toContain('ms)');
  });

  it('logRequest() chooses error for 5xx and merges provided context', () => {
    logger.logRequest('PUT', '/api/y', 500, 99, { userId: 'admin' });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [text, ctx] = errorSpy.mock.calls[0];
    expect(text).toContain('PUT /api/y - 500 (99ms)');
    expect(ctx).toMatchObject({ userId: 'admin', custom_statusCode: 500 });
  });

  it('does not throw for assorted inputs', () => {
    expect(() => logger.info('x', { a: 1, custom_thing: 'y' })).not.toThrow();
    expect(() => logger.warn('y')).not.toThrow();
    expect(() => logger.debug('z')).not.toThrow();
    expect(() => logger.error('e', new TypeError('te'))).not.toThrow();
  });
});

describe('logger (production environment branches)', () => {
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
  // Save reference to jsdom window to restore later.
  const originalWindow = (globalThis as { window?: unknown }).window;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    // Restore env
    (process.env as Record<string, string | undefined>).NODE_ENV = ORIGINAL_NODE_ENV;
    delete process.env.NEXT_RUNTIME;
    // Restore window
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  /**
   * In production on a real Node runtime (window removed, NEXT_RUNTIME unset),
   * initPino() dynamically requires the real `pino` package and builds a logger
   * with a destination. Logs are then routed through pino (async file/stdout
   * destination) instead of the console. We assert behavior we can observe
   * deterministically: it constructs without throwing, never falls back to the
   * console for warn/error, and the production level filter drops info/debug.
   */
  it('initializes real pino in production and routes warn/error away from the console', async () => {
    delete (globalThis as { window?: unknown }).window;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    delete process.env.NEXT_RUNTIME;

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const { logger } = await import('@/lib/logger');

    expect(() => {
      logger.warn('prod warn', { userId: 'u1' });
      logger.error('prod error', new ServiceError('svc', 'CODE', 500), { srId: 's1' });
      logger.info('prod info');
      logger.debug('prod debug');
      logger.logRequest('GET', '/health', 200, 3);
    }).not.toThrow();

    // pino path was used, so the console fallback never fired for warn/error.
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    // info/debug are below the production threshold and are dropped entirely.
    expect(infoSpy).not.toHaveBeenCalled();
  });

  /**
   * In production but on the Edge runtime, initPino() short-circuits and leaves
   * pinoLogger === null, so output() takes the console branch. The production
   * level filter still applies: warn/error are emitted, info/debug are dropped.
   */
  it('uses the console fallback (with prod filter) on the edge runtime', async () => {
    delete (globalThis as { window?: unknown }).window;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    process.env.NEXT_RUNTIME = 'edge';

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { logger } = await import('@/lib/logger');

    logger.warn('edge warn');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('edge warn');

    logger.error('edge error', new Error('e'));
    expect(errorSpy).toHaveBeenCalledTimes(1);

    // Below the production threshold -> filtered out.
    logger.info('edge info filtered');
    expect(infoSpy).not.toHaveBeenCalled();
    logger.debug('edge debug filtered');
    expect(logSpy).not.toHaveBeenCalled();
  });

  /**
   * In production inside a browser bundle (window present), initPino() also
   * short-circuits (isBrowser === true), leaving pinoLogger null and using the
   * console branch.
   */
  it('uses the console fallback in a browser production bundle', async () => {
    (globalThis as { window?: unknown }).window = originalWindow ?? ({} as unknown);
    (process.env as Record<string, string>).NODE_ENV = 'production';
    delete process.env.NEXT_RUNTIME;

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { logger } = await import('@/lib/logger');
    logger.error('browser prod error');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain('browser prod error');
  });
});
