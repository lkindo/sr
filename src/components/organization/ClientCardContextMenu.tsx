'use client';

import { useRouter } from 'next/navigation';
import { Edit, Eye, Power } from 'lucide-react';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui';
import { useToast } from '@/hooks/use-toast';

interface ClientCardContextMenuProps {
  clientId: string;
  clientName: string;
  isActive: boolean;
  children: React.ReactNode;
  onToggleStatus?: (clientId: string) => Promise<void>;
}

export function ClientCardContextMenu({
  clientId,
  clientName,
  isActive,
  children,
  onToggleStatus,
}: ClientCardContextMenuProps) {
  const router = useRouter();
  const { toast } = useToast();

  const handleEdit = () => {
    router.push(`/clients/${clientId}`);
  };

  const handleView = () => {
    router.push(`/clients/${clientId}`);
  };

  const handleToggleStatus = async () => {
    if (!onToggleStatus) {
      toast({
        title: '오류',
        description: '상태 변경 기능을 사용할 수 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await onToggleStatus(clientId);
      toast({
        title: '성공',
        description: `${clientName}이(가) ${isActive ? '비활성화' : '활성화'}되었습니다.`,
      });
    } catch {
      toast({
        title: '오류',
        description: '상태 변경 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={handleView} className="cursor-pointer">
          <Eye className="mr-2 h-4 w-4" />
          상세보기
        </ContextMenuItem>
        <ContextMenuItem onClick={handleEdit} className="cursor-pointer">
          <Edit className="mr-2 h-4 w-4" />
          수정
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={handleToggleStatus}
          className="cursor-pointer"
          disabled={!onToggleStatus}
        >
          <Power className="mr-2 h-4 w-4" />
          {isActive ? '비활성화' : '활성화'}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
