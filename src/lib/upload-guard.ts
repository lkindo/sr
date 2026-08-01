import { PayloadTooLargeError } from '@/lib/errors';
import { formatBytes, MAX_UPLOAD_TOTAL_SIZE } from '@/lib/file-validator';

/**
 * `formData()` 를 부르기 **전에** Content-Length 로 본문 크기를 선검사한다.
 *
 * Node 런타임의 `Request.formData()` 는 모든 파트를 인메모리 Blob 으로 파싱하므로,
 * 파싱이 끝난 뒤에 크기를 확인하면 이미 힙을 다 쓴 뒤다. 타입별 `maxSize` 검증
 * (`validateFile`)도 같은 이유로 메모리 보호에는 아무 도움이 되지 않았다(감사 3.41).
 *
 * nginx 가 `client_max_body_size` 로 먼저 막아 주지만, 그 설정과 앱 상한이 어긋나거나
 * nginx 를 우회해 앱에 직접 닿는 경로에서는 이 검사가 유일한 방어선이다.
 *
 * @param request - 아직 본문을 읽지 않은 요청
 * @param maxBytes - 허용 상한(기본값: 요청 총합 상한)
 * @throws {PayloadTooLargeError} Content-Length 가 상한을 넘을 때
 */
export function assertUploadSizeWithinLimit(
  request: Request,
  maxBytes: number = MAX_UPLOAD_TOTAL_SIZE
): void {
  const header = request.headers.get('content-length');

  // 헤더가 없거나(chunked 전송) 숫자가 아니면 여기서 막을 수 없다.
  // 그 경우는 nginx 의 client_max_body_size 와 파일별 검증에 맡긴다.
  if (!header) return;

  const contentLength = Number(header);
  if (!Number.isFinite(contentLength) || contentLength < 0) return;

  if (contentLength > maxBytes) {
    throw new PayloadTooLargeError(
      `업로드 용량이 너무 큽니다. 한 번에 최대 ${formatBytes(maxBytes)}까지 업로드할 수 있습니다.`
    );
  }
}
