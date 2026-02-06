'use client';

import { useState } from 'react';
import { Building2, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui';
import { Input } from '@/components/ui';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import { useToast } from '@/hooks/use-toast';
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
  const [isAssigning, setIsAssigning] = useState(false);
  const { toast } = useToast();

  const filteredClients = clients.filter(
    (client) =>
      client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAssign = async (clientId: string, clientName: string) => {
    setIsAssigning(true);
    try {
      const response = await fetch(`/api/users/${userId}/client`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to assign client');
      }

      // 경고가 있으면 사용자에게 알림
      if (result.warning) {
        const ongoingSRCount = result.data?.ongoingSRCount || 0;
        toast({
          title: '진행 중인 SR 확인',
          description: `${userName}님에게 진행 중인 SR ${ongoingSRCount}건이 있습니다. 고객사가 할당되었지만, SR 재할당을 권장합니다.`,
          variant: 'default',
        });
      } else {
        toast({
          title: '성공',
          description: `${userName}님이 ${clientName}에 할당되었습니다.`,
        });
      }

      setOpen(false);
      onAssigned?.();
    } catch (error) {
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : '고객사 할당에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsAssigning(false);
    }
  };

  return (
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
                    onClick={() => handleAssign(client.id, client.name)}
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
  );
}
