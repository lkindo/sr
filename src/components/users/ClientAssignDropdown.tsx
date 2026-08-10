'use client';

import { useState } from 'react';
import { Building2, Loader2 } from 'lucide-react';

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
import { Button } from '@/components/ui';
import { Input } from '@/components/ui';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import { useAssignClient } from '@/hooks/use-client-assignment';
import { cn } from '@/lib/utils';

interface Client {
  id: string;
  name: string;
  code: string;
}

interface ClientAssignDropdownProps {
  userId: string;
  userName: string;
  clients: Client[];
  onAssigned?: () => void;
}

export function ClientAssignDropdown({
  userId,
  userName,
  clients,
  onAssigned,
}: ClientAssignDropdownProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // 409(진행 중인 SR)를 확인 다이얼로그로 바꾸는 플로우는 훅이 들고 있다.
  // `pendingAssign` 이 null 이 아니면 강제 할당 확인 다이얼로그가 열린다.
  const {
    assign: handleAssign,
    pending: pendingAssign,
    clearPending,
    isProcessing: isAssigning,
  } = useAssignClient({
    userId,
    fallbackMessage: 'Failed to assign client',
    successDescription: ({ clientName }, ongoingSRsHandled) =>
      ongoingSRsHandled > 0
        ? `${userName}님이 ${clientName}에 할당되었습니다. 진행 중인 SR ${ongoingSRsHandled}건은 재할당을 권장합니다.`
        : `${userName}님이 ${clientName}에 할당되었습니다.`,
    errorDescription: '고객사 할당에 실패했습니다.',
    onBlocked: () => setOpen(false),
    onApplied: () => {
      setOpen(false);
      onAssigned?.();
    },
  });

  const filteredClients = clients.filter(
    (client) =>
      client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 border-dashed border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-700 hover:text-amber-900"
            disabled={isAssigning}
          >
            {isAssigning ? (
              <>
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                처리 중
              </>
            ) : (
              <>
                <Building2 className="mr-2 h-3 w-3" />
                고객사 할당
              </>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <div className="flex flex-col">
            <div className="px-3 py-2 border-b">
              <Input
                placeholder="고객사 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8"
                autoFocus
              />
            </div>
            <div className="max-h-64 overflow-y-auto">
              {filteredClients.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  검색 결과가 없습니다.
                </div>
              ) : (
                <div className="p-1">
                  {filteredClients.map((client) => (
                    <button
                      key={client.id}
                      onClick={() => handleAssign({ clientId: client.id, clientName: client.name })}
                      disabled={isAssigning}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors text-left',
                        isAssigning && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{client.name}</p>
                        <p className="text-xs text-muted-foreground">{client.code}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* 진행 중인 SR 확인 다이얼로그 (강제 할당) */}
      <AlertDialog
        open={pendingAssign !== null}
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
              <strong>{userName}</strong>님에게 진행 중인 SR {pendingAssign?.ongoingSRCount ?? 0}
              건이 있습니다. <strong>{pendingAssign?.clientName}</strong>에 그대로 할당하시겠습니까?
              <span className="mt-2 text-sm text-amber-600 bg-amber-50 p-2 rounded block">
                ⚠ 진행 중인 SR은 이동하지 않으므로, 할당 후 SR 재할당이 필요합니다.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isAssigning}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingAssign) {
                  handleAssign(pendingAssign, true);
                }
              }}
              disabled={isAssigning}
            >
              {isAssigning ? '처리 중...' : '계속 할당'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
