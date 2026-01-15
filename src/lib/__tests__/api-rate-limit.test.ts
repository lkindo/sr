import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, rateLimit } from '../api-rate-limit';
import { MemoryRateLimiter } from '../rate-limiter';

// Mock rate limiter
const createMockRateLimiter = () => {
  const checkMock = vi.fn();
  const resetMock = vi.fn();
  const resetAllMock = vi.fn();

  return {
    limiter: {
      check: checkMock,
      reset: resetMock,
      resetAll: resetAllMock,
    } as unknown as MemoryRateLimiter,
    checkMock,
    resetMock,
    resetAllMock,
  };
};

describe('withRateLimit', () => {
  let mockHandler: (req: NextRequest, context: { params: Record<string, string> }) => Promise<NextResponse>;

  beforeEach(() => {
    mockHandler = vi.fn().mockResolvedValue(
      NextResponse.json({ success: true })
    ) as unknown as (req: NextRequest, context: { params: Record<string, string> }) => Promise<NextResponse>;

    // Test environment bypass disable
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('TEST_MODE', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('Rate limit 내에서는 핸들러를 실행해야 함', async () => {
    const { limiter, checkMock } = createMockRateLimiter();

    checkMock.mockResolvedValue({
      allowed: true,
      current: 1,
      limit: 100,
      resetTime: 60000,
      remaining: 99,
    });

    const wrappedHandler = withRateLimit(mockHandler, { limiter });

    const request = new NextRequest('http://localhost/api/test');
    const context = { params: {} };
    const response = await wrappedHandler(request, context);

    expect(mockHandler).toHaveBeenCalledWith(request, context);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json).toEqual({ success: true });
  });

  it('Rate limit 초과 시 429 에러를 반환해야 함', async () => {
    const { limiter, checkMock } = createMockRateLimiter();

    checkMock.mockResolvedValue({
      allowed: false,
      current: 100,
      limit: 100,
      resetTime: 30000,
      remaining: 0,
    });

    const wrappedHandler = withRateLimit(mockHandler, { limiter });

    const request = new NextRequest('http://localhost/api/test');
    const context = { params: {} };
    const response = await wrappedHandler(request, context);

    expect(mockHandler).not.toHaveBeenCalled();
    expect(response.status).toBe(429);

    const json = await response.json();
    expect(json.error).toBe('Too Many Requests');
    expect(json.limit).toBe(100);
    expect(json.remaining).toBe(0);
  });

  it('Rate limit 헤더를 포함해야 함', async () => {
    const { limiter, checkMock } = createMockRateLimiter();

    checkMock.mockResolvedValue({
      allowed: true,
      current: 50,
      limit: 100,
      resetTime: 60000,
      remaining: 50,
    });

    const wrappedHandler = withRateLimit(mockHandler, {
      limiter,
      includeHeaders: true,
    });

    const request = new NextRequest('http://localhost/api/test');
    const context = { params: {} };
    const response = await wrappedHandler(request, context);

    expect(response.headers.get('X-RateLimit-Limit')).toBe('100');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('50');
    expect(response.headers.has('X-RateLimit-Reset')).toBe(true);
  });

  it('Rate limit 초과 시 Retry-After 헤더를 포함해야 함', async () => {
    const { limiter, checkMock } = createMockRateLimiter();

    checkMock.mockResolvedValue({
      allowed: false,
      current: 100,
      limit: 100,
      resetTime: 30000, // 30초
      remaining: 0,
    });

    const wrappedHandler = withRateLimit(mockHandler, { limiter });

    const request = new NextRequest('http://localhost/api/test');
    const context = { params: {} };
    const response = await wrappedHandler(request, context);

    expect(response.headers.get('Retry-After')).toBe('30'); // 초 단위
  });

  it('커스텀 키 생성기를 사용해야 함', async () => {
    const { limiter, checkMock } = createMockRateLimiter();

    checkMock.mockResolvedValue({
      allowed: true,
      current: 1,
      limit: 100,
      resetTime: 60000,
      remaining: 99,
    });

    const customKeyGenerator = vi.fn().mockReturnValue('custom-key');

    const wrappedHandler = withRateLimit(mockHandler, {
      limiter,
      keyGenerator: customKeyGenerator,
    });

    const request = new NextRequest('http://localhost/api/test');
    const context = { params: {} };
    await wrappedHandler(request, context);

    expect(customKeyGenerator).toHaveBeenCalledWith(request);
    expect(checkMock).toHaveBeenCalledWith('custom-key');
  });

  it('커스텀 Rate limit 초과 핸들러를 사용해야 함', async () => {
    const { limiter, checkMock } = createMockRateLimiter();

    checkMock.mockResolvedValue({
      allowed: false,
      current: 100,
      limit: 100,
      resetTime: 30000,
      remaining: 0,
    });

    const customOnRateLimitExceeded = vi.fn().mockResolvedValue(
      NextResponse.json({ error: 'Custom error' }, { status: 429 })
    );

    const wrappedHandler = withRateLimit(mockHandler, {
      limiter,
      onRateLimitExceeded: customOnRateLimitExceeded,
    });

    const request = new NextRequest('http://localhost/api/test');
    const context = { params: {} };
    const response = await wrappedHandler(request, context);

    expect(customOnRateLimitExceeded).toHaveBeenCalled();
    expect(response.status).toBe(429);

    const json = await response.json();
    expect(json.error).toBe('Custom error');
  });

  it('includeHeaders false면 헤더를 포함하지 않아야 함', async () => {
    const { limiter, checkMock } = createMockRateLimiter();

    checkMock.mockResolvedValue({
      allowed: true,
      current: 1,
      limit: 100,
      resetTime: 60000,
      remaining: 99,
    });

    const wrappedHandler = withRateLimit(mockHandler, {
      limiter,
      includeHeaders: false,
    });

    const request = new NextRequest('http://localhost/api/test');
    const context = { params: {} };
    const response = await wrappedHandler(request, context);

    expect(response.headers.has('X-RateLimit-Limit')).toBe(false);
    expect(response.headers.has('X-RateLimit-Remaining')).toBe(false);
    expect(response.headers.has('X-RateLimit-Reset')).toBe(false);
  });
});

describe('rateLimit', () => {
  it('프리셋 이름으로 Rate limiter를 생성해야 함', async () => {
    const mockHandler = vi.fn().mockResolvedValue(
      NextResponse.json({ success: true })
    ) as unknown as (req: NextRequest, context: { params: Record<string, string> }) => Promise<NextResponse>;

    // 실제 rate limiter를 사용하지만 바로 체크
    const wrappedHandler = rateLimit(mockHandler, 'standard');

    const request = new NextRequest('http://localhost/api/test');
    const context = { params: {} };
    const response = await wrappedHandler(request, context);

    // 첫 요청은 항상 성공
    expect(response.status).toBe(200);
    expect(mockHandler).toHaveBeenCalled();
  });

  it('기본값으로 standard 프리셋을 사용해야 함', async () => {
    const mockHandler = vi.fn().mockResolvedValue(
      NextResponse.json({ success: true })
    ) as unknown as (req: NextRequest, context: { params: Record<string, string> }) => Promise<NextResponse>;

    const wrappedHandler = rateLimit(mockHandler); // preset 생략

    const request = new NextRequest('http://localhost/api/test');
    const context = { params: {} };
    const response = await wrappedHandler(request, context);

    expect(response.status).toBe(200);
  });
});
