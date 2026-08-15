import { z } from 'zod';

import { MAX_UPLOAD_FILE_COUNT } from '@/lib/file-validator';

/** UUID 접두사(36자 + 하이픈)를 붙여도 일반적인 파일시스템의 255바이트 한도를 넘지 않는다. */
const MAX_UPLOAD_FILE_NAME_LENGTH = 218;

export const attachmentSrIdSchema = z
  .string({ error: 'SR ID가 필요합니다.' })
  .min(1, 'SR ID가 필요합니다.')
  .max(30, 'SR ID가 너무 깁니다.');

/**
 * `File` 런타임 전역에 의존하지 않는 업로드 파트 검증.
 *
 * Playwright와 일부 Node 테스트 환경에는 `globalThis.File`이 없으므로
 * `z.instanceof(File)`은 스키마를 만드는 순간 ReferenceError를 낸다. 반면
 * `Request.formData()`는 파일 파트와 텍스트 파트를 모두 돌려주기 때문에 단순
 * `as File` 캐스팅도 안전하지 않다. 실제 후속 코드가 사용하는 표면만 확인한다.
 */
export const uploadFileSchema = z.custom<File>(
  (value): value is File => {
    if (value === null || typeof value !== 'object') return false;

    const candidate = value as Partial<File>;
    return (
      typeof candidate.name === 'string' &&
      candidate.name.length > 0 &&
      candidate.name.length <= MAX_UPLOAD_FILE_NAME_LENGTH &&
      typeof candidate.size === 'number' &&
      Number.isFinite(candidate.size) &&
      candidate.size >= 0 &&
      typeof candidate.type === 'string' &&
      typeof candidate.slice === 'function' &&
      typeof candidate.arrayBuffer === 'function'
    );
  },
  { message: '올바른 파일을 선택해주세요.' }
);

export const singleAttachmentUploadSchema = z.object({
  file: uploadFileSchema,
  srId: attachmentSrIdSchema,
});

export const batchAttachmentUploadSchema = z.object({
  files: z
    .array(uploadFileSchema)
    .min(1, '업로드할 파일을 선택해주세요.')
    .max(
      MAX_UPLOAD_FILE_COUNT,
      `한 번에 최대 ${MAX_UPLOAD_FILE_COUNT}개의 파일만 업로드할 수 있습니다.`
    ),
});
