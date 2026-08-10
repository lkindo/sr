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

interface UserCardContextMenuProps {
  userId: string;
  userName: string;
  isActive: boolean;
  children: React.ReactNode;
  /**
   * ⚠️ 두 번째 인자는 **현재 상태**다("원하는 상태" 가 아니다). 뒤집기는 받는 쪽이 한다 —
   * `UsersClient.tsx` 의 `handleToggleActive(u.id, u.isActive)` 와 같은 관례다.
   * 예전에는 `userId` 만 넘겨서 페이지가 보낼 값을 알 수 없었고, 그 결과 빈 본문이 나갔다.
   */
  onToggleStatus?: (userId: string, isActive: boolean) => Promise<void>;
}

export function UserCardContextMenu({
  userId,
  userName,
  isActive,
  children,
  onToggleStatus,
}: UserCardContextMenuProps) {
  const router = useRouter();
  const { toast } = useToast();

  const handleEdit = () => {
    router.push(`/users/${userId}`);
  };

  const handleView = () => {
    router.push(`/users/${userId}`);
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
      // 현재 상태를 그대로 넘긴다. 뒤집는 책임은 페이지 쪽 mutation 에 있다.
      await onToggleStatus(userId, isActive);
      toast({
        title: '성공',
        description: `${userName}이(가) ${isActive ? '비활성화' : '활성화'}되었습니다.`,
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
