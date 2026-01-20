'use client';

import React from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface ClientTableProps {
  clients: any[];
  loading: boolean;
  expandedRows: Set<string>;
  clientUsers: Record<string, any[]>;
  onToggleRowExpansion: (clientId: string) => void;
  onUsersClick: (client: any, e: React.MouseEvent) => void;
  onCreateClient: () => void;
}

export function ClientTable({
  clients,
  loading,
  expandedRows,
  clientUsers,
  onToggleRowExpansion,
  onUsersClick,
  onCreateClient,
}: ClientTableProps) {
  return (
    <div className="hidden md:block overflow-x-auto">
      <Table className="sr-table-template">
        <TableHeader>
          <TableRow>
            <TableHead className="w-12"></TableHead>
            <TableHead>코드</TableHead>
            <TableHead>고객사명</TableHead>
            <TableHead>산업</TableHead>
            <TableHead>담당자</TableHead>
            <TableHead>이메일</TableHead>
            <TableHead>사용자</TableHead>
            <TableHead>SR</TableHead>
            <TableHead>상태</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={9} className="text-center py-8">
                <div className="flex justify-center items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                  <span className="text-muted-foreground">로딩 중...</span>
                </div>
              </TableCell>
            </TableRow>
          ) : clients.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="text-center py-12">
                <div className="flex flex-col items-center gap-3">
                  <p className="text-muted-foreground">등록된 고객사가 없습니다.</p>
                  <Button variant="outline" size="sm" onClick={onCreateClient}>
                    <Plus className="mr-2 h-4 w-4" />첫 고객사 등록하기
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            clients.map((client) => {
              const isExpanded = expandedRows.has(client.id);
              const users = clientUsers[client.id] || [];
              return (
                <React.Fragment key={client.id}>
                  <TableRow className="hover:bg-muted/50">
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onToggleRowExpansion(client.id)}
                        className="h-8 w-8 p-0"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="font-medium text-center">{client.code}</TableCell>
                    <TableCell>
                      <Link
                        href={`/clients/${client.id}`}
                        className="text-primary hover:underline font-medium"
                      >
                        {client.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-center">{client.industry || '-'}</TableCell>
                    <TableCell className="text-center">{client.contactPerson || '-'}</TableCell>
                    <TableCell>{client.contactEmail || '-'}</TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant="secondary"
                        className="cursor-pointer hover:bg-secondary/80 transition-colors"
                        onClick={(e) => onUsersClick(client, e)}
                      >
                        {client._count?.users || 0}명
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{client._count?.srs || 0}건</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={client.isActive ? 'default' : 'secondary'}>
                        {client.isActive ? '활성' : '비활성'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow key={`${client.id}-expanded`} className="bg-muted/20">
                      <TableCell colSpan={9} className="p-0">
                        <div className="p-4 pl-16">
                          <h4 className="text-sm font-semibold mb-3 text-[hsl(var(--sr-primary-dark))]">
                            소속 사용자 ({users.length}명)
                          </h4>
                          {users.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-2">
                              등록된 사용자가 없습니다.
                            </p>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {users.map((uc: any) => (
                                <Link
                                  key={uc.user.id}
                                  href={`/users/${uc.user.id}`}
                                  className="flex items-center gap-2 p-3 rounded-md border bg-background hover:bg-accent transition-colors"
                                >
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{uc.user.name}</p>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {uc.user.email}
                                    </p>
                                  </div>
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
