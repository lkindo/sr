'use client';

import Link from 'next/link';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';

import { Badge } from '@/components/ui';
import { Button } from '@/components/ui';

interface ClientMobileListProps {
  clients: any[];
  loading: boolean;
  expandedRows: Set<string>;
  clientUsers: Record<string, any[]>;
  onToggleRowExpansion: (clientId: string) => void;
  onUsersClick: (client: any, e: React.MouseEvent) => void;
  onCreateClient: () => void;
}

export function ClientMobileList({
  clients,
  loading,
  expandedRows,
  clientUsers,
  onToggleRowExpansion,
  onUsersClick,
  onCreateClient,
}: ClientMobileListProps) {
  return (
    <div className="md:hidden space-y-3 px-3 pb-4">
      {loading ? (
        <div className="text-center py-8">
          <div className="flex justify-center items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
            <span className="text-muted-foreground">로딩 중...</span>
          </div>
        </div>
      ) : clients.length === 0 ? (
        <div className="text-center py-12 border rounded-md border-dashed">
          <div className="flex flex-col items-center gap-3">
            <p className="text-muted-foreground">등록된 고객사가 없습니다.</p>
            <Button variant="outline" size="sm" onClick={onCreateClient}>
              <Plus className="mr-2 h-4 w-4" />첫 고객사 등록하기
            </Button>
          </div>
        </div>
      ) : (
        clients.map((client) => {
          const isExpanded = expandedRows.has(client.id);
          const users = clientUsers[client.id] || [];
          return (
            <div
              key={client.id}
              className="border rounded-lg bg-card text-card-foreground shadow-sm overflow-hidden"
            >
              <div className="p-3.5 space-y-2">
                {/* Header: Name & Status */}
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/clients/${client.id}`}
                        className="font-semibold text-base hover:underline text-primary truncate"
                      >
                        {client.name}
                      </Link>
                      <span className="text-xs text-muted-foreground">({client.code})</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {client.industry || '미지정'}
                    </div>
                  </div>
                  <Badge
                    variant={client.isActive ? 'default' : 'secondary'}
                    className="text-[10px] h-5 px-1.5 shrink-0"
                  >
                    {client.isActive ? '활성' : '비활성'}
                  </Badge>
                </div>

                {/* 2-Column Grid Info */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] leading-relaxed border-t border-border/50 pt-2 pb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-muted-foreground font-medium shrink-0">담당자</span>
                    <span className="truncate text-foreground font-medium">
                      {client.contactPerson || '-'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-muted-foreground font-medium shrink-0">이메일</span>
                    <span className="truncate text-foreground font-medium">
                      {client.contactEmail || '-'}
                    </span>
                  </div>
                </div>

                {/* Stats & Actions */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex gap-1.5">
                    <Badge
                      variant="secondary"
                      className="text-[10px] h-5 px-1.5 cursor-pointer hover:bg-secondary/80"
                      onClick={(e) => onUsersClick(client, e)}
                    >
                      사용자 {client._count?.users || 0}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                      SR {client._count?.srs || 0}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onToggleRowExpansion(client.id)}
                    className="h-7 w-7 p-0"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Expanded Section (Users) */}
              {isExpanded && (
                <div className="bg-muted/30 px-4 pb-4 pt-2 border-t">
                  <h4 className="text-xs font-semibold mb-2 text-muted-foreground">
                    소속 사용자 ({users.length})
                  </h4>
                  {users.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      등록된 사용자가 없습니다.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {users.map((uc: any) => (
                        <Link
                          key={uc.user.id}
                          href={`/users/${uc.user.id}`}
                          className="flex items-center justify-between p-2 rounded border bg-background text-sm"
                        >
                          <span className="font-medium">{uc.user.name}</span>
                          <span className="text-xs text-muted-foreground">{uc.user.email}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
