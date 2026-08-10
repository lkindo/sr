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
import { useAssignClient, useRemoveClient } from '@/hooks/use-client-assignment';

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

  // 고객사 제거는 UserClient 레코드 삭제
  const { remove: handleRemove, isProcessing: isRemoving } = useRemoveClient({
    userId,
    fallbackMessage: 'Failed to remove client',
    successDescription: `${userName}님의 고객사 소속이 해제되었습니다.`,
    errorDescription: '고객사 소속 해제에 실패했습니다.',
    onRemoved: () => {
      setShowRemoveDialog(false);
      onChanged?.();
    },
  });

  // 409(진행 중인 SR)를 확인 다이얼로그로 바꾸는 플로우는 훅이 들고 있다.
  // `pendingChange` 가 null 이 아니면 강제 변경 확인 다이얼로그가 열린다.
  const {
    assign: handleChange,
    pending: pendingChange,
    clearPending,
    isProcessing: isChanging,
  } = useAssignClient({
    userId,
    fallbackMessage: 'Failed to change client',
    successDescription: ({ clientName }, ongoingSRsHandled) =>
      ongoingSRsHandled > 0
        ? `${userName}님의 고객사가 ${clientName}(으)로 변경되었습니다. 진행 중인 SR ${ongoingSRsHandled}건은 재할당을 권장합니다.`
        : `${userName}님의 고객사가 ${clientName}(으)로 변경되었습니다.`,
    errorDescription: '고객사 변경에 실패했습니다.',
    onBlocked: () => setShowChangePopover(false),
    onApplied: () => {
      setShowChangePopover(false);
      onChanged?.();
    },
  });

  // 두 변이는 원래 하나의 `isProcessing` state 를 공유했다 — 어느 쪽이든 도는 동안
  // 변경·해제 버튼이 모두 잠긴다. 그 동작을 그대로 유지한다.
  const isProcessing = isRemoving || isChanging;

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
                      onClick={() => handleChange({ clientId: c.id, clientName: c.name })}
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

      {/* 진행 중인 SR 확인 다이얼로그 (강제 변경) */}
      <AlertDialog
        open={pendingChange !== null}
        onOpenChange={(next) => {
          if (!next) {
            clearPending();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>진행 중인 SR이 있습니다</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{userName}</strong>님에게 진행 중인 SR {pendingChange?.ongoingSRCount ?? 0}
              건이 있습니다. 소속을 <strong>{pendingChange?.clientName}</strong>(으)로
              변경하시겠습니까?
              <span className="mt-2 text-sm text-amber-600 bg-amber-50 p-2 rounded block">
                ⚠ 진행 중인 SR은 이동하지 않으므로, 변경 후 SR 재할당이 필요합니다.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingChange) {
                  handleChange(pendingChange, true);
                }
              }}
              disabled={isProcessing}
            >
              {isProcessing ? '처리 중...' : '계속 변경'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
