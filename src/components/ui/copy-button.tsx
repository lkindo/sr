'use client';

import * as React from 'react';
import { Check, Copy } from 'lucide-react';

import { Button, ButtonProps } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface CopyButtonProps extends ButtonProps {
  value: string;
  message?: string;
}

export function CopyButton({
  value,
  message = '복사되었습니다',
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

  return (
    <Button
      size={size}
      variant={variant}
      className={cn('h-6 w-6 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900', className)}
      onClick={(e) => {
        e.stopPropagation();
        onCopy();
      }}
      {...props}
    >
      <span className="sr-only">Copy</span>
      {hasCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}
