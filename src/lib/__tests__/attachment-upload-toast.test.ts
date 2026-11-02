import { describe, expect, it } from 'vitest';

import { attachmentUploadToast, NO_ATTACHMENT_UPLOAD } from '../attachment-upload-toast';

describe('attachmentUploadToast', () => {
  // 토스트는 하나만 보인다. 실패를 성공 문구로 덮으면 사용자는 첨부가 올라간 줄 안다.
  it.each(['생성', '수정'] as const)(
    '업로드가 실패하면 %s 성공이 아니라 경고를 보여 준다',
    (action) => {
      const toast = attachmentUploadToast(action, { ...NO_ATTACHMENT_UPLOAD, failed: true });

      expect(toast.title).toBe('경고');
      expect(toast.description).toBe(`SR은 ${action}되었으나 첨부파일 업로드에 실패했습니다.`);
      expect(toast.variant).toBe('destructive');
    }
  );

  it('일부가 거부되면 파일별 사유를 보여 준다', () => {
    const toast = attachmentUploadToast('생성', {
      uploaded: 1,
      rejected: [{ fileName: 'a.exe', error: '허용되지 않은 형식' }],
      failed: false,
    });

    expect(toast.variant).toBe('destructive');
    expect(toast.description).toBe(
      'SR은 생성되었습니다. 1개 업로드 / 1개 실패 — a.exe: 허용되지 않은 형식'
    );
  });

  it('전부 올라가면 개수를 포함한 성공을 보여 준다', () => {
    const toast = attachmentUploadToast('수정', { ...NO_ATTACHMENT_UPLOAD, uploaded: 2 });

    expect(toast).toEqual({
      title: '성공',
      description: 'SR이 수정되었습니다. (첨부파일 2개 업로드)',
    });
  });

  it('첨부가 없으면 저장 성공만 보여 준다', () => {
    expect(attachmentUploadToast('생성', NO_ATTACHMENT_UPLOAD)).toEqual({
      title: '성공',
      description: 'SR이 생성되었습니다.',
    });
  });
});
