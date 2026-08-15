import { describe, expect, it } from 'vitest';

import {
  batchAttachmentUploadSchema,
  singleAttachmentUploadSchema,
  uploadFileSchema,
} from '@/lib/upload-schemas';

const duckFile = (name = 'note.txt') => ({
  name,
  size: 4,
  type: 'text/plain',
  arrayBuffer: async () => new ArrayBuffer(4),
  slice: () => ({ arrayBuffer: async () => new ArrayBuffer(0) }),
});

describe('uploadFileSchema', () => {
  it('File 전역 없이 실제 사용 표면을 가진 객체를 허용한다', () => {
    expect(uploadFileSchema.safeParse(duckFile()).success).toBe(true);
  });

  it('FormData의 텍스트 파트를 거부한다', () => {
    expect(uploadFileSchema.safeParse('not-a-file').success).toBe(false);
  });

  it('저장에 필요한 arrayBuffer가 없거나 파일명이 너무 길면 거부한다', () => {
    const { arrayBuffer: _arrayBuffer, ...unreadableFile } = duckFile();

    expect(uploadFileSchema.safeParse(unreadableFile).success).toBe(false);
    expect(uploadFileSchema.safeParse(duckFile('a'.repeat(219))).success).toBe(false);
  });

  it('단일 업로드는 파일과 SR ID를 모두 요구한다', () => {
    expect(singleAttachmentUploadSchema.safeParse({ file: duckFile(), srId: '' }).success).toBe(
      false
    );
  });

  it('배치 업로드는 10개를 초과할 수 없다', () => {
    expect(
      batchAttachmentUploadSchema.safeParse({
        srId: 'sr-1',
        files: Array.from({ length: 11 }, (_, index) => duckFile(`${index}.txt`)),
      }).success
    ).toBe(false);
  });
});
