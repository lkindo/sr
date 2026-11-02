import { ConflictError } from '@/lib/errors';

/**
 * 폼을 연 뒤로 SR 이 바뀌었으면 거절한다. 트랜잭션의 version 가드는 서버가 읽은 값끼리만
 * 비교하므로, 오래 열어 둔 폼의 덮어쓰기는 여기서만 잡힌다. 생략한 요청은 비교하지 않는다.
 *
 * 호출자는 권한 확인 뒤에 부른다. 먼저 부르면 권한 없는 사용자가 응답으로 버전을 추측할 수 있다.
 */
export function assertVersionUnchanged(expected: number | undefined, current: number): void {
  if (expected !== undefined && expected !== current) {
    throw new ConflictError(
      '다른 사용자가 먼저 이 SR을 변경했습니다. 입력한 내용을 복사해 두고, 새로고침한 뒤 다시 시도해주세요.'
    );
  }
}
