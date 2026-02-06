'use client';

import Link from 'next/link';
import { CheckSquare, Square } from 'lucide-react';

import { Badge } from '@/components/ui';
import { Button } from '@/components/ui';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import { ClientAssignDropdown } from '@/components/users/ClientAssignDropdown';
import { ClientBadgeWithActions } from '@/components/users/ClientBadgeWithActions';
import { UserActions } from '@/components/users/UserActions';
import { getUserTypeBadgeVariant, getUserTypeLabel } from '@/lib/user-helpers';

interface UserTableProps {
  users: any[];
  loading: boolean;
  searchQuery: string;
  selectedUserIds: Set<string>;
  clients: any[];
  onToggleAll: () => void;
  onToggleUser: (userId: string) => void;
  onAssignRoles: (user: any) => void;
  onToggleActive: (userId: string, isActive: boolean) => void;
  onDelete: (user: any) => void;
  onRefresh: () => void;
}

export function UserTable({
  users,
  loading,
  searchQuery,
  selectedUserIds,
  clients,
  onToggleAll,
  onToggleUser,
  onAssignRoles,
  onToggleActive,
  onDelete,
  onRefresh,
}: UserTableProps) {
  return (
    <div className="hidden md:block overflow-x-auto">
      <Table className="sr-table-template">
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
              <Button variant="ghost" size="sm" onClick={onToggleAll} className="h-8 w-8 p-0">
                {selectedUserIds.size === users.length && users.length > 0 ? (
                  <CheckSquare className="h-4 w-4" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
              </Button>
            </TableHead>
            <TableHead>이름</TableHead>
            <TableHead>이메일</TableHead>
            <TableHead>유형</TableHead>
            <TableHead>고객사</TableHead>
            <TableHead>역할</TableHead>
            <TableHead>상태</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8">
                <div className="flex justify-center items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                  <span className="text-muted-foreground">로딩 중...</span>
                </div>
              </TableCell>
            </TableRow>
          ) : users.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8">
                {searchQuery ? '검색 결과가 없습니다.' : '등록된 사용자가 없습니다.'}
              </TableCell>
            </TableRow>
          ) : (
            users.map((user) => (
              <TableRow key={user.id} className="cursor-pointer hover:bg-muted/50">
                <TableCell className="text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleUser(user.id);
                    }}
                    className="h-8 w-8 p-0"
                  >
                    {selectedUserIds.has(user.id) ? (
                      <CheckSquare className="h-4 w-4 text-primary" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </Button>
                </TableCell>
                <TableCell className="font-medium text-center">
                  <Link href={`/users/${user.id}`} className="text-primary hover:underline">
                    {user.name}
                  </Link>
                </TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell className="text-center">
                  {(() => {
                    const typeLabel = getUserTypeLabel(user);
                    return <Badge variant={getUserTypeBadgeVariant(typeLabel)}>{typeLabel}</Badge>;
                  })()}
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex gap-1 flex-wrap justify-center">
                    {(() => {
                      // 시스템 운영팀(ADMIN, MANAGER, ENGINEER)은 고객사 할당 불가
                      const isSystemTeam = user.roles.some((ur: any) =>
                        ['ADMIN', 'MANAGER', 'ENGINEER'].includes(ur.role.name)
                      );

                      if (isSystemTeam) {
                        return (
                          <Badge variant="secondary" className="text-xs text-muted-foreground">
                            할당 불가
                          </Badge>
                        );
                      }

                      return user.clients.length === 0 ? (
                        <ClientAssignDropdown
                          userId={user.id}
                          userName={user.name}
                          clients={clients}
                          onAssigned={onRefresh}
                        />
                      ) : (
                        user.clients.map((uc: any) => (
                          <ClientBadgeWithActions
                            key={uc.client.id}
                            userId={user.id}
                            userName={user.name}
                            client={uc.client}
                            allClients={clients}
                            onChanged={onRefresh}
                          />
                        ))
                      );
                    })()}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex gap-1 flex-wrap justify-center">
                    {user.roles.length === 0 ? (
                      <Badge variant="outline">역할 없음</Badge>
                    ) : (
                      user.roles.map((ur: any) => (
                        <Badge key={ur.role.id} variant="secondary">
                          {ur.role.name}
                        </Badge>
                      ))
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant={user.isActive ? 'default' : 'secondary'}>
                    {user.isActive ? '활성' : '비활성'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
