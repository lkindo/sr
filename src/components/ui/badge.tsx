import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/10 text-primary shadow-none',
        secondary: 'border-transparent bg-secondary text-[#475569]',
        destructive: 'border-transparent bg-destructive text-destructive',
        outline: 'border-input text-foreground bg-transparent',
        success: 'border-transparent bg-emerald-500 text-emerald-700',
        warning: 'border-transparent bg-amber-500 text-amber-700',
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
  const baseClass = cn(badgeVariants({ variant }), className);
  if (variant === 'destructive') {
    return <div className={`${baseClass} bg-destructive/10`} {...props} />;
  }
  if (variant === 'success') {
    return <div className={`${baseClass} bg-emerald-500/10`} {...props} />;
  }
  if (variant === 'warning') {
    return <div className={`${baseClass} bg-amber-500/10`} {...props} />;
  }
  return <div className={baseClass} {...props} />;
}

export { Badge, badgeVariants };
