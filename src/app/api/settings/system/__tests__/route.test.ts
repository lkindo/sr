import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ debug: vi.fn() }));

vi.mock('@/lib/auth-wrapper', () => ({
  withAuthAndRateLimit:
    (handler: (request: NextRequest, context: unknown) => Promise<Response>) =>
    (request: NextRequest) =>
      handler(request, { session: { user: { id: 'admin-1', roles: ['ADMIN'] } } }),
}));

vi.mock('@/lib/logger', () => ({ logger: { debug: mocks.debug } }));

import { PUT } from '../route';

const request = (body: unknown) =>
  new NextRequest('http://localhost/api/settings/system', {
    method: 'PUT',
    body: JSON.stringify(body),
  });

beforeEach(() => vi.clearAllMocks());

describe('PUT /api/settings/system', () => {
  it('화면이 저장하는 세 필드를 검증하고 빈 관리자 이메일도 허용한다', async () => {
    const response = await PUT(
      request({ siteName: 'SR', siteDescription: '설명', adminEmail: '' }),
      {} as never
    );

    expect(response.status).toBe(200);
    expect(mocks.debug).toHaveBeenCalledWith('Updating system settings', {
      custom_siteName: 'SR',
    });
  });

  it('잘못된 관리자 이메일은 저장 로직 전에 거부한다', async () => {
    await expect(
      PUT(request({ siteName: 'SR', siteDescription: '설명', adminEmail: 'invalid' }), {} as never)
    ).rejects.toThrow('유효한 관리자 이메일 주소를 입력해주세요.');

    expect(mocks.debug).not.toHaveBeenCalled();
  });

  it('알 수 없는 설정 필드를 조용히 버리지 않는다', async () => {
    await expect(
      PUT(
        request({
          siteName: 'SR',
          siteDescription: '설명',
          adminEmail: 'admin@example.com',
          smtpPassword: 'secret',
        }),
        {} as never
      )
    ).rejects.toMatchObject({
      name: 'ValidationError',
      code: 'VALIDATION_ERROR',
      statusCode: 400,
    });

    expect(mocks.debug).not.toHaveBeenCalled();
  });

  it.each([
    [{ siteName: '', siteDescription: '설명', adminEmail: '' }, '사이트 이름을 입력해주세요.'],
    [{ siteName: 'SR', siteDescription: '', adminEmail: '' }, '사이트 설명을 입력해주세요.'],
    [
      { siteName: '가'.repeat(101), siteDescription: '설명', adminEmail: '' },
      '사이트 이름은 100자를 초과할 수 없습니다.',
    ],
    [
      { siteName: 'SR', siteDescription: '가'.repeat(256), adminEmail: '' },
      '사이트 설명은 255자를 초과할 수 없습니다.',
    ],
  ])('필수값과 길이 경계를 저장 전에 거부한다', async (body, message) => {
    await expect(PUT(request(body), {} as never)).rejects.toThrow(message);
    expect(mocks.debug).not.toHaveBeenCalled();
  });
});
