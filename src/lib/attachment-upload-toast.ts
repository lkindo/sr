/**
 * SR 저장 뒤의 첨부 업로드 결과.
 * 응답이 201 이어도 일부 파일이 거부될 수 있고(`rejected`), 전부 실패하면 예외로 끝난다(`failed`).
 */
export interface AttachmentUploadOutcome {
  uploaded: number;
  rejected: Array<{ fileName: string; error: string }>;
  failed: boolean;
}

export const NO_ATTACHMENT_UPLOAD: AttachmentUploadOutcome = {
  uploaded: 0,
  rejected: [],
  failed: false,
};

/**
 * 저장과 업로드를 합친 결과를 토스트 하나로 만든다.
 *
 * 토스트는 한 번에 하나만 보인다(TOAST_LIMIT=1). 실패 경고를 띄운 뒤 성공 토스트를 또 띄우면
 * 경고가 교체되어 사용자는 첨부가 올라간 줄 안다. 그래서 결과를 끝까지 모아 한 번만 보여 준다.
 */
export function attachmentUploadToast(action: '생성' | '수정', upload: AttachmentUploadOutcome) {
  if (upload.failed) {
    return {
      title: '경고',
      description: `SR은 ${action}되었으나 첨부파일 업로드에 실패했습니다.`,
      variant: 'destructive' as const,
    };
  }

  if (upload.rejected.length > 0) {
    const reasons = upload.rejected.map((r) => `${r.fileName}: ${r.error}`).join(', ');
    return {
      title: '일부 첨부파일이 업로드되지 않았습니다',
      description: `SR은 ${action}되었습니다. ${upload.uploaded}개 업로드 / ${upload.rejected.length}개 실패 — ${reasons}`,
      variant: 'destructive' as const,
    };
  }

  const uploadedNote = upload.uploaded > 0 ? ` (첨부파일 ${upload.uploaded}개 업로드)` : '';
  return { title: '성공', description: `SR이 ${action}되었습니다.${uploadedNote}` };
}
