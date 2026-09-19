import { describe, expect, it } from 'vitest';

import { validateFile } from '../file-validator';

/**
 * 구형 Office(.doc/.xls/.ppt) 첨부 — file-type 을 **목킹하지 않고** 실제 감지 경로로 본다.
 *
 * 구형 Office 는 OLE 복합 문서(CFB) 컨테이너라 file-type 이 `application/x-cfb` 로 감지한다. 예전에는 이 값이
 * 허용 목록에 없어서, 문서(매뉴얼·PRD)가 허용한다고 적고 허용 목록에도 msword 등이 있는 파일이 **항상**
 * 거부됐다. 목킹한 테스트로는 이 어긋남이 드러나지 않는다 — 감지 결과를 테스트가 정해 버리기 때문이다.
 */

/** CFB 서명(D0 CF 11 E0 A1 B1 1A E1)으로 시작하는 파일. 내용 판정에는 앞 4100 바이트만 쓰인다. */
function cfbFile(name: string, size = 1024): File {
  const bytes = new Uint8Array(4100);
  bytes.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const file = new File([bytes], name);
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('구형 Office 첨부', () => {
  it.each([
    ['report.doc', 'application/msword'],
    ['budget.xls', 'application/vnd.ms-excel'],
    ['slides.ppt', 'application/vnd.ms-powerpoint'],
  ])('%s 는 %s 로 허용한다', async (name, mime) => {
    await expect(validateFile(cfbFile(name))).resolves.toEqual({ mimeType: mime, size: 1024 });
  });

  it('CFB 컨테이너라도 구형 Office 확장자가 아니면 거부한다(예: 확장자만 바꾼 설치 파일)', async () => {
    await expect(validateFile(cfbFile('setup.dat'))).rejects.toThrow(
      '허용되지 않은 파일 형식입니다'
    );
  });

  it('형식별 크기 상한은 그대로 적용한다(.doc 20MB)', async () => {
    await expect(validateFile(cfbFile('huge.doc', 21 * 1024 * 1024))).rejects.toThrow();
  });
});
