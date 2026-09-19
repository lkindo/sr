import { Check } from 'lucide-react';

import { Badge, type BadgeProps } from '@/components/ui';
import { statusBadgeVariantOf, statusLabelOf } from '@/lib/constants/sr';

/**
 * SR 상태 배지 — 모든 화면이 이 컴포넌트로 상태를 그린다(2026-09-18 소유자 결정 D16).
 *
 * 색은 정본 맵(`constants/sr.ts` 의 statusBadgeVariantOf), 라벨은 statusLabelOf 다. 확인완료는 완료와 같은 초록에
 * 체크 아이콘을 더해 '고객 확인까지 끝남' 을 보인다 — 색은 보조 수단이고 라벨은 항상 있다.
 * 모르는 상태 코드는 코드 그대로 테두리 배지로 보인다(숨기지 않는다).
 */
export function SRStatusBadge({
  status,
  ...props
}: { status: string } & Omit<BadgeProps, 'variant' | 'children'>) {
  return (
    <Badge variant={statusBadgeVariantOf(status)} {...props}>
      {status === 'CONFIRMED' && <Check className="mr-1 h-3 w-3" aria-hidden="true" />}
      {statusLabelOf(status)}
    </Badge>
  );
}
