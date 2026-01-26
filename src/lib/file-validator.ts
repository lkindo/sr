import { fileTypeFromBuffer } from 'file-type';

/**
 * 허용된 파일 MIME 타입 목록
 */
export const ALLOWED_FILE_TYPES = {
  // 이미지
  'image/jpeg': { ext: ['.jpg', '.jpeg'], maxSize: 10 * 1024 * 1024 }, // 10MB
  'image/png': { ext: ['.png'], maxSize: 10 * 1024 * 1024 }, // 10MB
  'image/gif': { ext: ['.gif'], maxSize: 5 * 1024 * 1024 }, // 5MB
  'image/webp': { ext: ['.webp'], maxSize: 10 * 1024 * 1024 }, // 10MB

  // 문서
  'application/pdf': { ext: ['.pdf'], maxSize: 20 * 1024 * 1024 }, // 20MB
  'application/msword': { ext: ['.doc'], maxSize: 20 * 1024 * 1024 }, // 20MB
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    ext: ['.docx'],
    maxSize: 20 * 1024 * 1024,
  }, // 20MB
  'application/vnd.ms-excel': { ext: ['.xls'], maxSize: 20 * 1024 * 1024 }, // 20MB
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    ext: ['.xlsx'],
    maxSize: 20 * 1024 * 1024,
  }, // 20MB
  'application/vnd.ms-powerpoint': { ext: ['.ppt'], maxSize: 50 * 1024 * 1024 }, // 50MB
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': {
    ext: ['.pptx'],
    maxSize: 50 * 1024 * 1024,
  }, // 50MB

  // 텍스트
  'text/plain': { ext: ['.txt'], maxSize: 5 * 1024 * 1024 }, // 5MB
  'text/csv': { ext: ['.csv'], maxSize: 10 * 1024 * 1024 }, // 10MB

  // 압축
  'application/zip': { ext: ['.zip'], maxSize: 100 * 1024 * 1024 }, // 100MB
  'application/x-rar-compressed': { ext: ['.rar'], maxSize: 100 * 1024 * 1024 }, // 100MB
  'application/x-7z-compressed': { ext: ['.7z'], maxSize: 100 * 1024 * 1024 }, // 100MB
} as const;

/**
 * 금지된 파일 확장자 목록 (실행 파일, 스크립트 등)
 */
const DANGEROUS_EXTENSIONS = [
  '.exe',
  '.bat',
  '.cmd',
  '.com',
  '.pif',
  '.scr',
  '.vbs',
  '.js',
  '.jar',
  '.msi',
  '.app',
  '.deb',
  '.rpm',
  '.dmg',
  '.pkg',
  '.sh',
  '.bash',
  '.ps1',
];

/**
 * 파일 검증 에러 타입
 */
export class FileValidationError extends Error {
  constructor(
    message: string,
    public code: 'INVALID_TYPE' | 'SIZE_EXCEEDED' | 'DANGEROUS_FILE' | 'MIME_MISMATCH'
  ) {
    super(message);
    this.name = 'FileValidationError';
  }
}

/**
 * 파일 크기 검증
 *
 * @param size - 파일 크기 (bytes)
 * @param maxSize - 최대 허용 크기 (bytes)
 * @throws {FileValidationError} 파일 크기 초과 시
 */
export function validateFileSize(size: number, maxSize: number): void {
  if (size > maxSize) {
    throw new FileValidationError(
      `파일 크기가 너무 큽니다. 최대 ${formatBytes(maxSize)}까지 업로드 가능합니다.`,
      'SIZE_EXCEEDED'
    );
  }
}

/**
 * 파일 확장자 검증 (위험한 확장자 차단)
 *
 * @param fileName - 파일명
 * @throws {FileValidationError} 위험한 확장자인 경우
 */
export function validateFileExtension(fileName: string): void {
  const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));

  if (DANGEROUS_EXTENSIONS.includes(ext)) {
    throw new FileValidationError(
      `보안상의 이유로 ${ext} 파일은 업로드할 수 없습니다.`,
      'DANGEROUS_FILE'
    );
  }
}

/**
 * 파일 내용 기반 MIME 타입 검증 (Magic Number)
 *
 * 파일 확장자 스푸핑을 방지하기 위해 파일의 실제 내용을 분석합니다.
 *
 * @param buffer - 파일 버퍼
 * @param fileName - 파일명 (확장자 확인용)
 * @returns 검증된 MIME 타입
 * @throws {FileValidationError} MIME 타입 불일치 또는 허용되지 않은 타입
 */
export async function validateFileContent(buffer: ArrayBuffer, fileName: string): Promise<string> {
  const uint8Array = new Uint8Array(buffer);

  // file-type 라이브러리로 실제 파일 타입 감지
  const detectedType = await fileTypeFromBuffer(uint8Array);

  // 파일 타입을 감지하지 못한 경우 (텍스트 파일 등)
  if (!detectedType) {
    // 텍스트 파일은 별도 처리
    const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
    if (['.txt', '.csv'].includes(ext)) {
      return ext === '.txt' ? 'text/plain' : 'text/csv';
    }

    throw new FileValidationError('파일 형식을 인식할 수 없습니다.', 'INVALID_TYPE');
  }

  // 허용된 MIME 타입인지 확인
  if (!(detectedType.mime in ALLOWED_FILE_TYPES)) {
    throw new FileValidationError(
      `허용되지 않은 파일 형식입니다. (감지된 형식: ${detectedType.mime})`,
      'INVALID_TYPE'
    );
  }

  // 파일 확장자와 실제 MIME 타입이 일치하는지 확인
  const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
  const mimeType = detectedType.mime as keyof typeof ALLOWED_FILE_TYPES;
  const allowedExts = ALLOWED_FILE_TYPES[mimeType].ext;

  if (!(allowedExts as readonly string[]).includes(ext)) {
    throw new FileValidationError(
      `파일 확장자(${ext})와 실제 파일 형식(${detectedType.mime})이 일치하지 않습니다.`,
      'MIME_MISMATCH'
    );
  }

  return detectedType.mime;
}

/**
 * 파일 전체 검증 (크기, 확장자, 내용)
 *
 * @param file - File 객체
 * @returns 검증된 파일 정보 { mimeType, size }
 * @throws {FileValidationError} 검증 실패 시
 *
 * @example
 * ```typescript
 * const formData = await request.formData();
 * const file = formData.get('file') as File;
 *
 * try {
 *   const { mimeType, size } = await validateFile(file);
 *   // 파일 업로드 진행
 * } catch (error) {
 *   if (error instanceof FileValidationError) {
 *     return Response.json({ error: error.message }, { status: 400 });
 *   }
 * }
 * ```
 */
export async function validateFile(file: File): Promise<{
  mimeType: string;
  size: number;
}> {
  // 1. 파일 확장자 검증 (위험한 확장자)
  validateFileExtension(file.name);

  // 2. 파일 내용 기반 MIME 타입 검증
  // file-type 라이브러리는 파일의 앞부분(4100 bytes)만 확인하면 타입을 식별할 수 있습니다.
  // 전체 파일을 메모리에 올리는 것을 방지하기 위해 slice를 사용합니다.
  const buffer = await file.slice(0, 4100).arrayBuffer();
  const mimeType = await validateFileContent(buffer, file.name);

  // 3. 파일 크기 검증
  const maxSize = ALLOWED_FILE_TYPES[mimeType as keyof typeof ALLOWED_FILE_TYPES].maxSize;
  validateFileSize(file.size, maxSize);

  return {
    mimeType,
    size: file.size,
  };
}

/**
 * 바이트를 읽기 쉬운 형식으로 변환
 *
 * @param bytes - 바이트 크기
 * @returns 포맷된 문자열 (예: "10.5 MB")
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
