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
        destructive: 'border-transparent bg-destructive bg-opacity-10 text-destructive',
        outline: 'border-input text-foreground bg-transparent',
        success: 'border-transparent bg-[#10B981] bg-opacity-10 text-[#10B981]',
        warning: 'border-transparent bg-[#F59E0B] bg-opacity-10 text-[#F59E0B]',
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
  const finalClass = variant === 'destructive' ? `${baseClass} bg-destructive` : baseClass;
  return <div className={finalClass} {...props} />;
}

export { Badge, badgeVariants };
