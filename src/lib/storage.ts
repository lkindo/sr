import fs from 'fs';
import path from 'path';

import { logger } from '@/lib/logger';

// 업로드 디렉토리 설정 (프로젝트 루트의 pubic/uploads)
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

// 디렉토리 존재 여부 확인 및 생성
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export interface UploadResult {
  url: string;
  pathname: string;
  downloadUrl: string;
  size: number;
  type: string;
}

export async function uploadAttachmentBlob(srId: string, file: File): Promise<UploadResult> {
  const safeName = file.name.replace(/\s+/g, '-');
  const timestamp = Date.now();

  // SR ID별로 하위 디렉토리 생성
  const srDir = path.join(UPLOAD_DIR, 'attachments', srId);
  await fs.promises.mkdir(srDir, { recursive: true });

  const filename = `${timestamp}-${safeName}`;
  const filepath = path.join(srDir, filename);

  // File 객체를 Buffer로 변환하여 저장
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  await fs.promises.writeFile(filepath, buffer);

  // URL 생성 (public 폴더 기준)
  const pathname = `attachments/${srId}/${filename}`; // DB 저장용 경로
  const url = `/uploads/${pathname}`; // 웹 접근용 URL

  return {
    url: url,
    pathname: pathname,
    downloadUrl: url,
    size: file.size,
    type: file.type,
  };
}

export async function deleteAttachmentBlob(pathname: string) {
  if (!pathname) return;

  try {
    // pathname이 "attachments/..."로 시작한다고 가정
    // 실제 파일 경로는 public/uploads/ + pathname
    const filepath = path.join(UPLOAD_DIR, pathname);

    // 경로 탐색(Directory Traversal) 방지
    const resolvedPath = path.resolve(filepath);
    if (!resolvedPath.startsWith(path.resolve(UPLOAD_DIR))) {
      logger.warn(`[storage] Attempted path traversal attack: ${pathname}`);
      return;
    }

    if (fs.existsSync(filepath)) {
      await fs.promises.unlink(filepath);
    }
  } catch (error: unknown) {
    logger.error(
      `[storage] Failed to delete file: ${pathname}`,
      error instanceof Error ? error : undefined
    );
  }
}

export async function listAttachmentBlobs(
  prefix: string
): Promise<{ blobs: { url: string; pathname: string; size: number; uploadedAt: Date }[] } | null> {
  // 로컬 파일 시스템 리스트 구현은 복잡하고 현재 요구사항에서 필수적이지 않을 수 있어
  // 간단히 null 반환하거나 필요한 경우 구현.
  // 기존 Vercel Blob list 반환 타입과 맞추기 위해 간단한 스터브 제공.
  // 실제 로직이 필요하다면 재귀적 디렉토리 탐색이 필요함.
  logger.warn('[storage] listAttachmentBlobs is not fully implemented for local storage.');
  return { blobs: [] };
}
