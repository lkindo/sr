'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Building2, RefreshCw, X } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui';
import { Badge } from '@/components/ui';
import { Button } from '@/components/ui';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import { useToast } from '@/hooks/use-toast';

interface Client {
  id: string;
  name: string;
  code: string;
}

interface ClientBadgeWithActionsProps {
  userId: string;
  userName: string;
  client: Client;
  allClients: Client[];
  onChanged?: () => void;
}

export function ClientBadgeWithActions({
  userId,
  userName,
  client,
  allClients,
  onChanged,
}: ClientBadgeWithActionsProps) {
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [showChangePopover, setShowChangePopover] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const handleRemove = async () => {
    setIsProcessing(true);
    try {
      // 고객사 제거는 UserClient 레코드 삭제
      const response = await fetch(`/api/users/${userId}/client`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to remove client');
      }

      toast({
        title: '성공',
        description: `${userName}님의 고객사 소속이 해제되었습니다.`,
      });

      setShowRemoveDialog(false);
      onChanged?.();
    } catch (error) {
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : '고객사 소속 해제에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleChange = async (newClientId: string, newClientName: string) => {
    setIsProcessing(true);
    try {
      const response = await fetch(`/api/users/${userId}/client`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: newClientId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to change client');
      }

      if (result.warning) {
        const ongoingSRCount = result.data?.ongoingSRCount || 0;
        toast({
          title: '진행 중인 SR 확인',
          description: `${userName}님에게 진행 중인 SR ${ongoingSRCount}건이 있습니다. 고객사가 변경되었지만, SR 재할당을 권장합니다.`,
          variant: 'default',
        });
      } else {
        toast({
          title: '성공',
          description: `${userName}님의 고객사가 ${newClientName}(으)로 변경되었습니다.`,
        });
      }

      setShowChangePopover(false);
      onChanged?.();
    } catch (error) {
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : '고객사 변경에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Link href={`/clients/${client.id}`}>
        <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80 gap-1">
          <Building2 className="h-3 w-3" />
          {client.name}
        </Badge>
      </Link>

      <div className="flex items-center gap-1">
        {/* 변경 버튼 */}
        <Popover open={showChangePopover} onOpenChange={setShowChangePopover}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 hover:bg-blue-100 hover:text-blue-600"
              disabled={isProcessing}
              aria-label={`${userName}님의 고객사 변경`}
              title={`${userName}님의 고객사 변경`}
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground px-2 py-1">고객사 변경</p>
              <div className="max-h-48 overflow-y-auto">
                {allClients
                  .filter((c) => c.id !== client.id)
                  .map((c) => (
                    <button
                      key={c.id}
                      onClick={() => handleChange(c.id, c.name)}
                      disabled={isProcessing}
                      className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent transition-colors disabled:opacity-50"
                    >
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.code}</div>
                    </button>
                  ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* 해제 버튼 */}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 hover:bg-red-100 hover:text-red-600"
          onClick={() => setShowRemoveDialog(true)}
          disabled={isProcessing}
          aria-label={`${userName}님의 고객사 소속 해제`}
          title={`${userName}님의 고객사 소속 해제`}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      {/* 해제 확인 다이얼로그 */}
      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>고객사 소속 해제</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{userName}</strong>님의 <strong>{client.name}</strong> 소속을
              해제하시겠습니까?
              <span className="mt-2 text-sm text-amber-600 bg-amber-50 p-2 rounded block">
                ⚠ 기존 SR은 그대로 유지되지만, 더 이상 해당 고객사의 SR을 처리할 수 없습니다.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              disabled={isProcessing}
              className="bg-red-600 hover:bg-red-700"
            >
              {isProcessing ? '처리 중...' : '해제'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
