import { Badge } from '@/components/ui';

/**
 * 가입 승인을 기다리는 계정이 가입 때 보낸 확인 링크를 아직 열지 않았다는 표시(2026-09-18 소유자 결정 D13 B+).
 * 승인을 막지는 않는다 — 다른 사람의 이메일로 낸 신청일 수 있으니 본인 여부를 한 번 더 확인하라는 신호다.
 * 대상 판정은 `user-helpers.showsEmailUnverified`(화면 공용)다.
 */
export function EmailUnverifiedBadge() {
  return (
    <Badge
      variant="outline"
      className="text-[10px] shrink-0"
      title="가입할 때 보낸 확인 링크를 아직 열지 않았습니다. 본인이 낸 신청인지 한 번 더 확인하세요."
    >
      이메일 미인증
    </Badge>
  );
}
