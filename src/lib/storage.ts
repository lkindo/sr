import fs from 'fs';
import path from 'path';

import { logger } from '@/lib/logger';

// 첨부파일 저장 디렉토리.
// 보안(C4): 웹루트(public) 밖에 저장하여 정적 서빙으로 인한 무인증 접근을 차단한다.
// 다운로드는 인증 라우트(/api/attachments/[id]/download)로만 제공된다.
// STORAGE_DIR 환경변수로 재정의 가능(프로덕션은 Docker 볼륨을 이 경로에 마운트).
export const STORAGE_DIR = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : path.join(process.cwd(), 'var', 'uploads');

/**
 * 레거시 저장 위치(`public/uploads`) 폴백은 제거했다(감사 4.1).
 *
 * **왜 위험했나.** Next 는 `public/` 아래 전부를 URL 루트에서 정적 서빙한다. 즉 그 경로에
 * 있는 첨부는 `ensureCanReadSR` 를 거치지 않고 `/uploads/attachments/<파일명>` 으로
 * 바로 열린다. `src/proxy.ts` 의 matcher 가 이미지 확장자를 제외하므로 **이미지 첨부는
 * 세션 없이도** 받아갈 수 있었고, 그 외 확장자도 테넌트를 가리지 않고 인증만 되면 열렸다.
 * 다운로드 라우트가 인가를 거는 것과 정면으로 어긋난다.
 *
 * **왜 지금 지워도 안전한가.** 프로덕션에서 영속되는 것은 `sr_uploads` 볼륨
 * (`/app/var/uploads` = STORAGE_DIR) 뿐이다. `public/uploads` 는 볼륨이 아니라 이미지
 * 레이어이므로, 런타임에 그 경로로 쓰인 파일은 다음 배포의 컨테이너 재생성에서 사라진다.
 * 이미지에 실려 있던 것은 저장소에 추적되던 파일 1개뿐이었고 그것도 함께 제거했다.
 * 따라서 이 폴백이 프로덕션에서 해석할 수 있는 파일은 이제 존재하지 않는다.
 */

// 디렉토리 존재 여부 확인 및 생성
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

export interface UploadResult {
  url: string;
  pathname: string;
  downloadUrl: string;
  size: number;
  type: string;
}

export async function uploadAttachmentBlob(srId: string, file: File): Promise<UploadResult> {
  // 파일명 정화: 경로 구분자/상위 경로 제거 후 안전 문자만 허용 (경로 탐색 방지)
  const baseName = path.basename(file.name).replace(/\s+/g, '-');
  const safeName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_') || 'file';

  // srId에도 경로 구분자가 끼어들 수 없도록 basename 처리 (방어적)
  const safeSrId = path.basename(srId);

  const timestamp = Date.now();

  // SR ID별로 하위 디렉토리 생성 (웹루트 밖 STORAGE_DIR 기준)
  const srDir = path.join(STORAGE_DIR, 'attachments', safeSrId);

  const filename = `${timestamp}-${safeName}`;
  const filepath = path.join(srDir, filename);

  // 경로 탐색(Directory Traversal) 방지: 최종 경로가 STORAGE_DIR 내부인지 확인
  const resolvedRoot = path.resolve(STORAGE_DIR);
  if (!path.resolve(filepath).startsWith(resolvedRoot + path.sep)) {
    logger.warn(`[storage] Attempted path traversal on upload: ${file.name}`);
    throw new Error('잘못된 파일 경로입니다.');
  }

  await fs.promises.mkdir(srDir, { recursive: true });

  // File 객체를 Buffer로 변환하여 저장
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  await fs.promises.writeFile(filepath, buffer);

  // DB 저장용 상대 경로 (STORAGE_DIR 기준). 다운로드 라우트가 이 경로로 파일을 해석한다.
  const pathname = `attachments/${safeSrId}/${filename}`;

  return {
    url: pathname,
    pathname,
    downloadUrl: pathname,
    size: file.size,
    type: file.type,
  };
}

/**
 * 첨부 레코드의 storagePath/fileUrl 로부터 실제 파일의 절대 경로를 안전하게 해석한다.
 *
 * - STORAGE_DIR **한 곳만** 허용 루트다. 웹루트(public) 폴백은 제거했다(위 주석 참조).
 * - 절대 경로(구 레코드가 저장한 형태)도 이 루트 내부인 경우에 한해 허용
 * - 경로 탐색 차단(containment check)
 *
 * @returns 존재하는 파일의 절대 경로, 없으면 null
 */
export function resolveAttachmentFilePath(
  storagePathOrUrl: string | null | undefined
): string | null {
  if (!storagePathOrUrl) return null;

  const root = path.resolve(STORAGE_DIR);

  // 절대 경로(레거시 srs 라우트가 저장한 형태)
  if (path.isAbsolute(storagePathOrUrl)) {
    const resolved = path.resolve(storagePathOrUrl);
    const contained = resolved === root || resolved.startsWith(root + path.sep);
    return contained && fs.existsSync(resolved) ? resolved : null;
  }

  // URL 형태(/uploads/...) 또는 상대 경로 → 상대 경로로 정규화
  const rel = storagePathOrUrl.replace(/^\/?uploads\//, '').replace(/^\/+/, '');

  const resolved = path.resolve(path.join(root, rel));
  if ((resolved === root || resolved.startsWith(root + path.sep)) && fs.existsSync(resolved)) {
    return resolved;
  }

  return null;
}

export async function deleteAttachmentBlob(pathname: string) {
  if (!pathname) return;

  try {
    // STORAGE_DIR 내부로 한정해 안전하게 경로를 해석한다.
    const filepath = resolveAttachmentFilePath(pathname);
    if (filepath && fs.existsSync(filepath)) {
      await fs.promises.unlink(filepath);
    }
  } catch (error: unknown) {
    logger.error(
      `[storage] Failed to delete file: ${pathname}`,
      error instanceof Error ? error : undefined
    );
  }
}
