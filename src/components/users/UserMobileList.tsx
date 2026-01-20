'use client';

import Link from 'next/link';
import { CheckSquare, Square } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ClientAssignDropdown } from '@/components/users/ClientAssignDropdown';
import { ClientBadgeWithActions } from '@/components/users/ClientBadgeWithActions';
import { UserActions } from '@/components/users/UserActions';
import { getUserTypeBadgeVariant, getUserTypeLabel } from '@/lib/user-helpers';
import { cn } from '@/lib/utils';

interface UserMobileListProps {
  users: any[];
  loading: boolean;
  searchQuery: string;
  selectedUserIds: Set<string>;
  clients: any[];
  onToggleUser: (userId: string) => void;
  onAssignRoles: (user: any) => void;
  onToggleActive: (userId: string, isActive: boolean) => void;
  onDelete: (user: any) => void;
  onRefresh: () => void;
}

export function UserMobileList({
  users,
  loading,
  searchQuery,
  selectedUserIds,
  clients,
  onToggleUser,
  onAssignRoles,
  onToggleActive,
  onDelete,
  onRefresh,
}: UserMobileListProps) {
  return (
    <div className="md:hidden space-y-4 px-4 pb-4">
      {loading ? (
        <div className="text-center py-8">
          <div className="flex justify-center items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
            <span className="text-muted-foreground">로딩 중...</span>
          </div>
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-12 border rounded-md border-dashed">
          <p className="text-muted-foreground">
            {searchQuery ? '검색 결과가 없습니다.' : '등록된 사용자가 없습니다.'}
          </p>
        </div>
      ) : (
        users.map((user) => (
          <div
            key={user.id}
            className={cn(
              'border rounded-lg bg-card text-card-foreground shadow-sm overflow-hidden',
              selectedUserIds.has(user.id) && 'ring-2 ring-primary border-primary'
            )}
          >
            <div className="p-4 space-y-3">
              {/* Header: Checkbox, Name, Status */}
              <div className="flex items-start gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleUser(user.id);
                  }}
                  className="h-8 w-8 p-0 shrink-0 mt-0.5"
                >
                  {selectedUserIds.has(user.id) ? (
                    <CheckSquare className="h-4 w-4 text-primary" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                </Button>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <div>
                      <Link
                        href={`/users/${user.id}`}
                        className="font-semibold text-base hover:underline text-primary block truncate"
                      >
                        {user.name}
                      </Link>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                    <Badge
                      variant={user.isActive ? 'default' : 'secondary'}
                      className="shrink-0 ml-2"
                    >
                      {user.isActive ? '활성' : '비활성'}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Info Chips */}
              <div className="flex flex-wrap gap-2 pt-1">
                {/* User Type Badge */}
                {(() => {
                  const typeLabel = getUserTypeLabel(user);
                  return (
                    <Badge variant={getUserTypeBadgeVariant(typeLabel)} className="text-xs">
                      {typeLabel}
                    </Badge>
                  );
                })()}

                {/* Roles */}
                {user.roles.length > 0 &&
                  user.roles.map((ur: any) => (
                    <Badge key={ur.role.id} variant="secondary" className="text-xs">
                      {ur.role.name}
                    </Badge>
                  ))}
              </div>

              {/* Client Info */}
              <div className="pt-2 border-t border-border/50">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-12 shrink-0">고객사:</span>
                  <div className="flex-1">
                    {(() => {
                      const isSystemTeam = user.roles.some((ur: any) =>
                        ['ADMIN', 'MANAGER', 'ENGINEER'].includes(ur.role.name)
                      );

                      if (isSystemTeam) {
                        return (
                          <span className="text-xs text-muted-foreground">
                            할당 불가 (시스템 운영팀)
                          </span>
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
                        <div className="flex flex-wrap gap-1">
                          {user.clients.map((uc: any) => (
                            <ClientBadgeWithActions
                              key={uc.client.id}
                              userId={user.id}
                              userName={user.name}
                              client={uc.client}
                              allClients={clients}
                              onChanged={onRefresh}
                            />
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <UserActions
                user={user}
                onAssignRoles={onAssignRoles}
                onToggleActive={onToggleActive}
                onDelete={onDelete}
                variant="card"
              />
            </div>
          </div>
        ))
      )}
    </div>
  );
}
