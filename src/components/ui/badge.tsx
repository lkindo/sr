import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-muted text-foreground shadow-none',
        // 전경색을 하드코딩하면 테마 토큰이 무시된다. `--secondary` 는 #141414(어두운
        // 표면)인데 #475569(어두운 슬레이트)를 얹어 대비가 2.43:1 이었다 — 상태 배지가
        // 사실상 판독 불가였다(axe color-contrast). 토큰 짝(흰색)으로 되돌린다.
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        // 배경과 전경을 **여기서 최종값으로** 정한다.
        //
        // 예전에는 `bg-destructive text-destructive` 처럼 배경과 글자가 같은 색이었고,
        // 아래 Badge() 가 `cn()` **밖에서** 템플릿 문자열로 `bg-destructive/10` 을 덧붙여
        // 겨우 읽히게 만들고 있었다. 그 방식은 tailwind-merge 의 충돌 해소를 우회하므로
        // 두 배경 클래스가 동시에 살아남고, 어느 쪽이 이기는지는 CSS 소스 순서에 달린다.
        // 분기를 없애고 variant 하나가 최종 색을 갖게 한다.
        destructive: 'border-transparent bg-destructive/10 text-destructive',
        outline: 'border-input text-foreground bg-transparent',
        // 의미색은 globals.css의 --status-* 토큰이다. 15% 배경 위 텍스트 대비는
        // theme-contrast.test.ts에서 주간·야간의 카드·보조 표면 모두 검증한다.
        neutral: 'border-status-neutral-border bg-transparent text-status-neutral',
        info: 'border-transparent bg-status-info/15 text-status-info',
        success: 'border-transparent bg-status-success/15 text-status-success',
        // 확인완료처럼 '완료보다 한 단계 더 끝난' 상태. 같은 초록에 테두리를 더한다.
        successEmphasis: 'border-status-success/45 bg-status-success/15 text-status-success',
        warning: 'border-transparent bg-status-warning/15 text-status-warning',
        caution: 'border-transparent bg-status-caution/15 text-status-caution',
        // destructive(#ef4444/10%)는 카드 위 글자 대비가 4.46:1 로 기준에 조금 못 미친다. SR 배지는 이 변형을 쓴다.
        danger: 'border-transparent bg-status-danger/15 text-status-danger',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  // 모든 색은 cva variant 가 정한다. 여기서 클래스를 덧붙이지 않는다 —
  // `cn()` 밖에서 이어붙이면 tailwind-merge 를 우회해 충돌이 조용히 남는다.
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
