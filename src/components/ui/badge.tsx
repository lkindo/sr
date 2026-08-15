import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/10 text-primary shadow-none',
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
        // 다크 캔버스(#090909) 위에서 읽히는 명도를 고른다. emerald-700/amber-700 은
        // 어두운 표면 위 어두운 글자가 되어 대비가 무너진다.
        success: 'border-transparent bg-emerald-500/10 text-emerald-400',
        warning: 'border-transparent bg-amber-500/10 text-amber-400',
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
