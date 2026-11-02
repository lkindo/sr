import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findAttachment: vi.fn(),
  findSR: vi.fn(),
  createLog: vi.fn(),
  warn: vi.fn(),
  resolvePath: vi.fn(),
}));

vi.mock('@/lib/auth-wrapper', () => ({
  withAuthAndRateLimit: (handler: unknown) => handler,
}));
vi.mock('@/lib/prisma', () => ({
  default: {
    sRAttachment: { findUnique: mocks.findAttachment },
    sR: { findUnique: mocks.findSR },
  },
}));
vi.mock('@/lib/storage', () => ({ resolveAttachmentFilePath: mocks.resolvePath }));
vi.mock('@/lib/logger', () => ({ logger: { warn: mocks.warn } }));
vi.mock('@/services/audit.service', () => ({ auditService: { createLog: mocks.createLog } }));
vi.mock('fs', () => {
  const api = {
    promises: { stat: vi.fn().mockResolvedValue({ size: 3 }) },
    createReadStream: vi.fn(),
  };
  return { default: api, ...api };
});
vi.mock('stream', () => ({
  Readable: { toWeb: () => new Response('abc').body },
}));

import { GET } from '../route';

const ATTACHMENT = {
  id: 'att-1',
  srId: 'sr-1',
  fileName: '견적.pdf',
  fileType: 'application/pdf',
  fileUrl: '/x',
  storagePath: 'x',
};

const ADMIN = { id: 'admin-1', roles: ['ADMIN'], permissions: [], clientIds: [] };
const OUTSIDER = { id: 'out-1', roles: ['CLIENT_USER'], permissions: [], clientIds: ['client-9'] };

const download = (user: unknown) =>
  (GET as unknown as (r: NextRequest, c: unknown) => Promise<Response>)(
    new NextRequest('http://localhost/api/attachments/att-1/download', {
      headers: { 'x-real-ip': '5.6.7.8' },
    }),
    { session: { user }, params: Promise.resolve({ id: 'att-1' }) }
  );

describe('첨부 다운로드 감사 기록', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createLog.mockResolvedValue(undefined);
    mocks.findAttachment.mockResolvedValue(ATTACHMENT);
    mocks.findSR.mockResolvedValue({ id: 'sr-1', clientId: 'client-1', requesterId: 'r-1' });
    mocks.resolvePath.mockReturnValue('/data/x');
  });

  it('행위자, 파일, IP 를 남긴다', async () => {
    const response = await download(ADMIN);

    expect(response.status).toBe(200);
    expect(mocks.createLog).toHaveBeenCalledWith(null, {
      userId: 'admin-1',
      actionType: 'DOWNLOAD',
      targetEntity: 'SRAttachment',
      targetId: 'att-1',
      changes: { srId: 'sr-1', fileName: '견적.pdf', disposition: 'inline' },
      ipAddress: '5.6.7.8',
    });
  });

  it('권한이 없으면 기록하지 않는다', async () => {
    await expect(download(OUTSIDER)).rejects.toThrow('SR 조회 권한이 없습니다.');

    expect(mocks.createLog).not.toHaveBeenCalled();
  });

  it('파일이 없으면 기록하지 않는다', async () => {
    mocks.resolvePath.mockReturnValue(null);

    await expect(download(ADMIN)).rejects.toThrow();

    expect(mocks.createLog).not.toHaveBeenCalled();
  });

  // 기록 저장소 장애로 업무 파일까지 못 받게 하지는 않는다. 대신 경고를 남긴다.
  it('기록에 실패해도 내려받고 경고를 남긴다', async () => {
    mocks.createLog.mockRejectedValue(new Error('감사 로그 실패'));

    const response = await download(ADMIN);

    expect(response.status).toBe(200);
    expect(mocks.warn).toHaveBeenCalledOnce();
  });
});
