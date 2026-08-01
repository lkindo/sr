import { describe, expect, it } from 'vitest';

import { PayloadTooLargeError } from '../errors';
import { MAX_UPLOAD_FILE_SIZE, MAX_UPLOAD_TOTAL_SIZE } from '../file-validator';
import { assertUploadSizeWithinLimit } from '../upload-guard';

/**
 * 감사 3.41 회귀 테스트.
 *
 * Node 런타임의 `Request.formData()` 는 모든 파트를 인메모리 Blob 으로 파싱한다.
 * 파싱 이후에 하는 타입별 크기 검증은 메모리 보호가 되지 못하므로,
 * 본문을 읽기 **전에** Content-Length 로 막아야 한다.
 */

const requestWith = (contentLength: string | null) =>
  new Request('http://localhost/api/attachments', {
    method: 'POST',
    headers: contentLength === null ? {} : { 'content-length': contentLength },
  });

describe('assertUploadSizeWithinLimit', () => {
  it('상한 이하 요청은 통과시킨다', () => {
    expect(() => assertUploadSizeWithinLimit(requestWith(String(1024)))).not.toThrow();
  });

  it('상한과 정확히 같으면 통과시킨다', () => {
    expect(() =>
      assertUploadSizeWithinLimit(requestWith(String(MAX_UPLOAD_TOTAL_SIZE)))
    ).not.toThrow();
  });

  it('상한을 넘으면 413 으로 거부한다', () => {
    expect(() =>
      assertUploadSizeWithinLimit(requestWith(String(MAX_UPLOAD_TOTAL_SIZE + 1)))
    ).toThrowError(PayloadTooLargeError);
  });

  it('거부 시 statusCode 가 413 이다', () => {
    try {
      assertUploadSizeWithinLimit(requestWith(String(MAX_UPLOAD_TOTAL_SIZE + 1)));
      expect.unreachable('던져야 한다');
    } catch (error) {
      expect((error as PayloadTooLargeError).statusCode).toBe(413);
      expect((error as PayloadTooLargeError).code).toBe('PAYLOAD_TOO_LARGE');
    }
  });

  it('예전 상한이던 100MB 요청은 이제 거부된다', () => {
    expect(() => assertUploadSizeWithinLimit(requestWith(String(100 * 1024 * 1024)))).toThrowError(
      PayloadTooLargeError
    );
  });

  it('Content-Length 가 없으면(chunked) 통과시킨다 — nginx 와 파일별 검증에 맡긴다', () => {
    expect(() => assertUploadSizeWithinLimit(requestWith(null))).not.toThrow();
  });

  it('Content-Length 가 숫자가 아니면 통과시킨다', () => {
    expect(() => assertUploadSizeWithinLimit(requestWith('not-a-number'))).not.toThrow();
  });

  it('명시적 상한을 넘기면 그 값을 쓴다', () => {
    expect(() => assertUploadSizeWithinLimit(requestWith('2048'), 1024)).toThrowError(
      PayloadTooLargeError
    );
    expect(() => assertUploadSizeWithinLimit(requestWith('512'), 1024)).not.toThrow();
  });
});

describe('업로드 상한 상수', () => {
  it('파일당 상한이 50MB 다 (nginx client_max_body_size 와 동일)', () => {
    expect(MAX_UPLOAD_FILE_SIZE).toBe(50 * 1024 * 1024);
  });

  it('요청 총합 상한이 힙 상한(450MB)보다 충분히 작다', () => {
    // 동시 요청 몇 건이 겹쳐도 OOM-kill 이 나지 않아야 한다.
    expect(MAX_UPLOAD_TOTAL_SIZE).toBeLessThanOrEqual(50 * 1024 * 1024);
  });
});
