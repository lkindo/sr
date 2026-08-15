/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 감사 4.2 회귀 테스트 — 배치 첨부 업로드의 원자성과 감사 추적.
 *
 * 이 경로는 `createManyAndReturn` 후 N 개 update 를 `Promise.all` 로 실행했고,
 * 활동 로그는 **아예 없었다**. 단일 업로드 경로(`/api/attachments`)는 매번
 * `ATTACHMENT_ADDED` 를 남기므로, 같은 행위가 어느 URL 로 들어왔느냐에 따라
 * 감사 추적에 남기도 하고 안 남기도 했다.
 */

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  srFindUnique: vi.fn(),
  deleteBlob: vi.fn(),
  validateFile: vi.fn(),
  txCreateManyAndReturn: vi.fn(),
  txAttachmentUpdate: vi.fn(),
  txActivityCreateMany: vi.fn(),
  mkdir: vi.fn(),
  uploadBlob: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    $transaction: mocks.transaction,
    sR: { findUnique: mocks.srFindUnique },
  },
}));

vi.mock('@/lib/auth-wrapper', () => ({
  withAuthAndRateLimit: (handler: any) => (request: any, ctx: any) =>
    handler(request, { ...ctx, session: { user: { id: 'user-1', roles: ['ADMIN'] } } }),
}));

// 이 스위트의 관심사는 트랜잭션 원자성이지 인가가 아니므로 정책은 통과시킨다.
// 인가 계약 자체는 `src/lib/__tests__/policies.attachment.test.ts` 가 실물로 검증한다.
vi.mock('@/lib/policies', () => ({
  ensureCanReadSR: vi.fn(),
  ensureCanUpdateSR: vi.fn(),
  ensureCanAttachToSR: vi.fn(),
}));

vi.mock('@/lib/serialization', () => ({
  serializeResponse: (data: any) => data,
  serializeMany: (data: any) => data,
}));

vi.mock('@/lib/storage', () => ({
  deleteAttachmentBlob: mocks.deleteBlob,
  uploadAttachmentBlob: mocks.uploadBlob,
  STORAGE_DIR: '/tmp/storage',
}));

vi.mock('@/lib/upload-guard', () => ({ assertUploadSizeWithinLimit: vi.fn() }));

// fs 는 default export 도 요구된다(Node 내장 모듈을 통째로 대체하므로).
vi.mock('fs/promises', () => ({ default: { mkdir: mocks.mkdir }, mkdir: mocks.mkdir }));
vi.mock('fs', () => {
  const createWriteStream = vi.fn(() => ({}));
  return { default: { createWriteStream }, createWriteStream };
});
vi.mock('stream/promises', () => {
  const pipeline = vi.fn(async () => undefined);
  return { default: { pipeline }, pipeline };
});

vi.mock('@/lib/file-validator', async () => {
  const actual = await vi.importActual<any>('@/lib/file-validator');
  return { ...actual, validateFile: mocks.validateFile };
});

import { POST } from '../route';

const tx = {
  sRAttachment: {
    createManyAndReturn: mocks.txCreateManyAndReturn,
    update: mocks.txAttachmentUpdate,
  },
  sRActivity: { createMany: mocks.txActivityCreateMany },
};

/** jsdom 의 File 에는 stream() 이 없어 라우트의 파이프라인이 바로 죽는다. 최소한만 채운다. */
const streamableFile = (name: string) => {
  const file = new File(['x'], name, { type: 'text/plain' });
  Object.defineProperty(file, 'stream', {
    value: () =>
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([120]));
          controller.close();
        },
      }),
  });
  return file;
};

const request = (names: string[]) => {
  const form = new FormData();
  for (const n of names) form.append('files', streamableFile(n));
  return {
    formData: async () => form,
    url: 'http://localhost:3000/api/srs/sr-1/attachments',
    headers: new Headers(),
  } as any;
};

const call = (names: string[]) =>
  (POST as any)(request(names), { params: Promise.resolve({ id: 'sr-1' }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(async (cb: any) => cb(tx));
  mocks.srFindUnique.mockResolvedValue({ id: 'sr-1', clientId: 'c-1' });
  mocks.validateFile.mockResolvedValue({ mimeType: 'text/plain', size: 1 });
  mocks.txCreateManyAndReturn.mockImplementation(async ({ data }: any) =>
    data.map((d: any, i: number) => ({
      ...d,
      id: `att-${i}`,
      fileSize: 1,
      createdAt: new Date(),
    }))
  );
  mocks.txAttachmentUpdate.mockResolvedValue({});
  mocks.txActivityCreateMany.mockResolvedValue({ count: 2 });
  mocks.deleteBlob.mockResolvedValue(undefined);
  // 실제 `uploadAttachmentBlob` 과 같은 규칙: SR 별 하위 디렉터리 + UUID 파일명.
  let blobSeq = 0;
  mocks.uploadBlob.mockImplementation(async (srId: string, file: File) => {
    const pathname = `attachments/${srId}/uuid-${blobSeq++}-${file.name}`;
    return { url: pathname, pathname, size: 1, type: 'text/plain' };
  });
});

/**
 * 감사 D-8 회귀 방어 — 교차 테넌트 파일 유출.
 *
 * 예전에는 이 라우트만 자체 파일명 규칙(`${timestamp}_${index}_${safeFileName}`)을 갖고
 * 전 고객사가 `attachments/` 평면 디렉터리를 공유했다. 세 조각 중 어느 것도 테넌트를
 * 구분하지 않으므로, 서로 다른 SR 의 사용자가 같은 밀리초에 같은 이름의 파일을 같은
 * 순번으로 올리면 경로가 **정확히 같아졌다.** `createWriteStream` 기본 모드는 덮어쓰므로
 * 나중 것이 앞 것을 truncate 했고, DB 에는 서로 다른 SR 을 가리키는 두 행이 같은
 * storagePath 를 갖게 되어 A사 사용자가 B사 파일을 내려받을 수 있었다.
 */
describe('POST /api/srs/[id]/attachments — 저장 경로 격리', () => {
  it('저장은 공용 uploadAttachmentBlob 에 위임한다', async () => {
    await call(['보고서.pdf']);

    // 라우트가 자체 파일 쓰기를 하면 이 단언이 깨진다 — 그때가 규칙이 갈라지는 순간이다.
    expect(mocks.uploadBlob).toHaveBeenCalledTimes(1);
    expect(mocks.uploadBlob).toHaveBeenCalledWith('sr-1', expect.any(File));
  });

  it('storagePath 는 SR 별 하위 디렉터리를 포함한다', async () => {
    await call(['보고서.pdf']);

    const [{ data }] = mocks.txCreateManyAndReturn.mock.calls[0]!;
    // 평면 `attachments/<파일명>` 이면 테넌트 간 경로가 겹칠 수 있다.
    expect(data[0].storagePath).toMatch(/^attachments\/sr-1\//);
  });

  it('같은 이름의 파일을 여러 개 올려도 storagePath 가 서로 다르다', async () => {
    await call(['보고서.pdf', '보고서.pdf']);

    const [{ data }] = mocks.txCreateManyAndReturn.mock.calls[0]!;
    expect(data).toHaveLength(2);
    expect(data[0].storagePath).not.toBe(data[1].storagePath);
  });
});

describe('POST /api/srs/[id]/attachments — 배치 업로드', () => {
  it('삽입·fileUrl 갱신·활동 로그가 한 트랜잭션 안에서 일어난다', async () => {
    await call(['a.txt', 'b.txt']);

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.txCreateManyAndReturn).toHaveBeenCalledTimes(1);
    expect(mocks.txAttachmentUpdate).toHaveBeenCalledTimes(2);
  });

  it('배치도 파일마다 ATTACHMENT_ADDED 를 남긴다', async () => {
    await call(['a.txt', 'b.txt']);

    // 예전에는 이 경로만 활동 로그가 없어 배치 업로드가 감사 추적에서 통째로 빠졌다.
    expect(mocks.txActivityCreateMany).toHaveBeenCalledTimes(1);
    const rows = mocks.txActivityCreateMany.mock.calls[0]![0].data;
    expect(rows).toHaveLength(2);
    expect(rows.every((r: any) => r.type === 'ATTACHMENT_ADDED')).toBe(true);
    expect(rows.map((r: any) => r.description)).toEqual(['파일 추가: a.txt', '파일 추가: b.txt']);
  });

  it('트랜잭션이 실패하면 디스크에 쓴 파일을 모두 되돌린다', async () => {
    mocks.transaction.mockRejectedValue(new Error('db down'));

    await expect(call(['a.txt', 'b.txt'])).rejects.toThrow('db down');

    expect(mocks.deleteBlob).toHaveBeenCalledTimes(2);
  });
});
