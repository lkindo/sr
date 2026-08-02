/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 감사 4.2 회귀 테스트 — 첨부 쓰기 경로의 원자성.
 *
 * 세 경로가 모두 비원자적이었다.
 *
 * - 단일 업로드: `create`(fileUrl: '') → `update`(fileUrl 채움) → `sRActivity.create` 를
 *   트랜잭션 없이 순차 실행. 중간 실패 시 `fileUrl = ''` 인 죽은 링크나 감사 추적 없는
 *   첨부가 남았다. 게다가 파일은 이미 디스크에 있으므로 참조 없는 blob 도 남았다.
 * - 배치: `createManyAndReturn` 후 N 개 update 를 `Promise.all` 로 실행하고 활동 로그는
 *   아예 없었다 — 같은 행위가 경로에 따라 감사 추적에 남기도 하고 안 남기도 했다.
 * - 삭제: 파일을 **먼저** 지우고 행을 지웠다. 사이에 실패하면 없는 파일을 가리키는 행이
 *   남아 매 다운로드가 500 이 됐다.
 */

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  attachmentFindUnique: vi.fn(),
  srFindUnique: vi.fn(),
  uploadBlob: vi.fn(),
  deleteBlob: vi.fn(),
  validateFile: vi.fn(),
  // 트랜잭션 콜백에 넘어가는 tx 클라이언트
  txAttachmentCreate: vi.fn(),
  txAttachmentUpdate: vi.fn(),
  txAttachmentDelete: vi.fn(),
  txActivityCreate: vi.fn(),
}));

/** 실제 $transaction 처럼 콜백을 실행하는 가짜. 순서 기록을 위해 calls 배열을 공유한다. */
const order: string[] = [];

vi.mock('@/lib/prisma', () => ({
  default: {
    $transaction: mocks.transaction,
    sRAttachment: { findUnique: mocks.attachmentFindUnique },
    sR: { findUnique: mocks.srFindUnique },
  },
}));

vi.mock('@/lib/auth-wrapper', () => ({
  withAuthAndRateLimit: (handler: any) => (request: any, ctx: any) =>
    handler(request, { ...ctx, session: { user: { id: 'user-1', roles: ['ADMIN'] } } }),
}));

vi.mock('@/lib/policies', () => ({
  ensureCanReadSR: vi.fn(),
  ensureCanUpdateSR: vi.fn(),
}));

vi.mock('@/lib/serialization', () => ({
  serializeResponse: (data: any) => data,
  serializeMany: (data: any) => data,
}));

vi.mock('@/lib/storage', () => ({
  uploadAttachmentBlob: mocks.uploadBlob,
  deleteAttachmentBlob: mocks.deleteBlob,
  STORAGE_DIR: '/tmp/storage',
}));

vi.mock('@/lib/upload-guard', () => ({
  assertUploadSizeWithinLimit: vi.fn(),
}));

vi.mock('@/lib/file-validator', async () => {
  const actual = await vi.importActual<any>('@/lib/file-validator');
  return { ...actual, validateFile: mocks.validateFile };
});

import { DELETE } from '../[id]/route';
import { POST } from '../route';

const tx = {
  sRAttachment: {
    create: mocks.txAttachmentCreate,
    update: mocks.txAttachmentUpdate,
    delete: mocks.txAttachmentDelete,
  },
  sRActivity: { create: mocks.txActivityCreate },
};

const uploadRequest = () => {
  const form = new FormData();
  form.set('file', new File(['hello'], 'note.txt', { type: 'text/plain' }));
  form.set('srId', 'sr-1');
  return {
    formData: async () => form,
    url: 'http://localhost:3000/api/attachments',
    headers: new Headers(),
  } as any;
};

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;

  mocks.transaction.mockImplementation(async (cb: any) => {
    order.push('tx');
    return cb(tx);
  });
  mocks.deleteBlob.mockImplementation(async () => {
    order.push('deleteBlob');
  });
  mocks.uploadBlob.mockResolvedValue({ pathname: 'attachments/stored.txt' });
  mocks.validateFile.mockResolvedValue({ mimeType: 'text/plain', size: 5 });
  mocks.txAttachmentCreate.mockResolvedValue({ id: 'att-1', srId: 'sr-1', storagePath: 'p' });
  mocks.txAttachmentUpdate.mockResolvedValue({
    id: 'att-1',
    srId: 'sr-1',
    storagePath: 'p',
    fileUrl: '/api/attachments/att-1/download',
    // serializeResponse 를 모킹했으므로 BigInt 대신 number 로 둔다.
    // BigInt 직렬화 자체는 감사 3.14 회귀 테스트가 따로 덮는다.
    fileSize: 5,
    createdAt: new Date(),
  });
  mocks.txAttachmentDelete.mockResolvedValue({});
  mocks.txActivityCreate.mockResolvedValue({});
  mocks.srFindUnique.mockResolvedValue({ id: 'sr-1', clientId: 'c-1' });
});

describe('POST /api/attachments — 단일 업로드', () => {
  it('행 생성·fileUrl 갱신·활동 로그가 한 트랜잭션 안에서 일어난다', async () => {
    await (POST as any)(uploadRequest());

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    // 세 쓰기가 모두 tx 클라이언트로 갔다 — 전역 prisma 로 새는 것이 없어야 한다.
    expect(mocks.txAttachmentCreate).toHaveBeenCalledTimes(1);
    expect(mocks.txAttachmentUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.txActivityCreate).toHaveBeenCalledTimes(1);
    expect(mocks.txActivityCreate.mock.calls[0]![0].data.type).toBe('ATTACHMENT_ADDED');
  });

  it('트랜잭션이 실패하면 이미 올라간 blob 을 되돌린다', async () => {
    mocks.transaction.mockRejectedValue(new Error('db down'));

    await expect((POST as any)(uploadRequest())).rejects.toThrow('db down');

    // 롤백돼도 파일은 디스크에 남는다 — 참조 없는 blob 이 영구히 쌓이지 않도록 지운다.
    expect(mocks.deleteBlob).toHaveBeenCalledWith('attachments/stored.txt');
  });

  it('blob 정리 실패가 원래 오류를 가리지 않는다', async () => {
    mocks.transaction.mockRejectedValue(new Error('db down'));
    mocks.deleteBlob.mockRejectedValue(new Error('디스크 오류'));

    await expect((POST as any)(uploadRequest())).rejects.toThrow('db down');
  });
});

describe('DELETE /api/attachments/[id]', () => {
  const call = () =>
    (DELETE as any)(
      { url: 'http://localhost:3000/api/attachments/att-1', headers: new Headers() },
      {
        params: Promise.resolve({ id: 'att-1' }),
      } as any
    );

  beforeEach(() => {
    mocks.attachmentFindUnique.mockResolvedValue({
      id: 'att-1',
      srId: 'sr-1',
      fileName: 'note.txt',
      fileUrl: '/api/attachments/att-1/download',
      storagePath: 'attachments/stored.txt',
    });
  });

  it('행을 먼저 커밋하고 그 다음에 파일을 지운다', async () => {
    await call();

    // 예전 순서(blob 먼저)에서는 행 삭제가 실패하면 없는 파일을 가리키는 행이 남았다.
    expect(order).toEqual(['tx', 'deleteBlob']);
    expect(mocks.txAttachmentDelete).toHaveBeenCalledTimes(1);
    expect(mocks.txActivityCreate.mock.calls[0]![0].data.type).toBe('ATTACHMENT_REMOVED');
  });

  it('커밋 후 blob 삭제가 실패해도 요청은 성공한다', async () => {
    mocks.deleteBlob.mockRejectedValue(new Error('파일 없음'));

    const response = await call();

    // 행은 이미 사라졌다. 여기서 실패를 반환하면 사용자가 없는 첨부를 다시 지우려 한다.
    expect(response.status).toBe(200);
  });
});
