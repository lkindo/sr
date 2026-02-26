'use client';

import * as React from 'react';
import { Check, Copy } from 'lucide-react';

import { Button, ButtonProps } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface CopyButtonProps extends ButtonProps {
  value: string;
  message?: string;
  label?: string;
  successLabel?: string;
}

export function CopyButton({
  value,
  message = '복사되었습니다',
  label = '복사',
  successLabel = '복사됨',
  className,
  variant = 'ghost',
  size = 'icon',
  ...props
}: CopyButtonProps) {
  const { toast } = useToast();
  const [hasCopied, setHasCopied] = React.useState(false);

  React.useEffect(() => {
    if (hasCopied) {
      const timeout = setTimeout(() => setHasCopied(false), 2000);
      return () => clearTimeout(timeout);
    }
  }, [hasCopied]);

  const onCopy = () => {
    navigator.clipboard.writeText(value);
    setHasCopied(true);
    toast({
      description: message,
    });
  };

  const currentLabel = hasCopied ? successLabel : label;

  return (
    <Button
      size={size}
      variant={variant}
      className={cn('h-6 w-6 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900', className)}
      onClick={(e) => {
        e.stopPropagation();
        onCopy();
      }}
      title={currentLabel}
      {...props}
    >
      <span className="sr-only">{currentLabel}</span>
      {hasCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}
