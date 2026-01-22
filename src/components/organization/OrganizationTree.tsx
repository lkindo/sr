'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { Building2, ChevronDown, ChevronRight, GripVertical, Plus, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { ClientCardContextMenu } from './ClientCardContextMenu';
import { UserCardContextMenu } from './UserCardContextMenu';

export interface User {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  roles: Array<{
    role: {
      name: string;
    };
  }>;
}

export interface Client {
  id: string;
  code: string;
  name: string;
  industry?: string;
  isActive: boolean;
  _count?: {
    users: number;
    srs: number;
  };
}

interface OrganizationTreeProps {
  clients: Client[];
  expandedClients: Set<string>;
  clientUsers: Record<string, User[]>;
  onToggleClient: (clientId: string) => void;
  onAddUser: (clientId: string) => void;
  onToggleClientStatus?: (clientId: string) => Promise<void>;
  onToggleUserStatus?: (userId: string) => Promise<void>;
  onDragEnd?: (event: DragEndEvent) => void;
  onDragStart?: (event: DragStartEvent) => void;
  onDragOver?: (event: DragOverEvent) => void;
  searchQuery: string;
}

// 검색어 하이라이트 헬퍼 함수
function highlightText(text: string, query: string) {
  if (!query.trim()) return text;

  const regex = new RegExp(`(${query})`, 'gi');
  const parts = text.split(regex);

  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 px-0.5 rounded">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

// 드래그 가능한 사용자 카드 컴포넌트
interface DraggableUserCardProps {
  user: User;
  clientId: string;
  searchQuery: string;
  onToggleUserStatus?: (userId: string) => Promise<void>;
}

function DraggableUserCard({
  user,
  clientId,
  searchQuery,
  onToggleUserStatus,
}: DraggableUserCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `user-${user.id}`,
    data: { userId: user.id, sourceClientId: clientId, user },
  });

  return (
    <div ref={setNodeRef} className={cn('relative', isDragging && 'opacity-30')}>
      {/* 수평 연결선 - 모바일에서 숨김 */}
      <div className="absolute left-[-8px] md:left-[-16px] top-1/2 w-2 md:w-4 h-px bg-border hidden md:block"></div>

      <UserCardContextMenu
        userId={user.id}
        userName={user.name || '이름 없음'}
        isActive={user.isActive}
        onToggleStatus={onToggleUserStatus}
      >
        <Link
          href={user.id ? `/users/${user.id}` : '#'}
          className="flex items-center gap-2 p-1.5 md:p-2 rounded-md border bg-white hover:bg-accent hover:border-primary/50 hover:shadow-sm transition-all group relative"
        >
          {/* 드래그 핸들 */}
          <div
            {...listeners}
            {...attributes}
            className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
          </div>
          <div className="p-1 rounded-full bg-muted group-hover:bg-background shrink-0 hidden xs:block">
            <Users className="h-3 w-3 text-muted-foreground group-hover:text-primary" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-[13px] font-semibold truncate group-hover:text-primary">
                {highlightText(user.name || '이름 없음', searchQuery)}
              </p>
              <Badge variant={user.isActive ? 'default' : 'secondary'} className="text-xs shrink-0">
                {user.isActive ? '활성' : '비활성'}
              </Badge>
            </div>
            <p className="text-[10px] text-muted-foreground truncate -mt-0.5">
              {user.email ? highlightText(user.email, searchQuery) : '-'}
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {user.roles?.slice(0, 1).map((ur) => (
              <Badge
                key={ur.role?.name || Math.random()}
                variant="secondary"
                className="text-[9px] h-4 px-1 font-medium max-w-[50px] truncate"
              >
                {ur.role?.name}
              </Badge>
            ))}
            {user.roles && user.roles.length > 1 && (
              <span className="text-[9px] text-muted-foreground font-bold">
                +{user.roles.length - 1}
              </span>
            )}
          </div>

          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block" />
        </Link>
      </UserCardContextMenu>
    </div>
  );
}

// 드롭 가능한 고객사 헤더 컴포넌트
interface DroppableClientHeaderProps {
  client: Client;
  isExpanded: boolean;
  onToggleClient: (clientId: string) => void;
  onAddUser: (clientId: string) => void;
  onToggleClientStatus?: (clientId: string) => Promise<void>;
  searchQuery: string;
  userCount: number;
}

function DroppableClientHeader({
  client,
  isExpanded,
  onToggleClient,
  onAddUser,
  onToggleClientStatus,
  searchQuery,
  userCount,
}: DroppableClientHeaderProps) {
  const { setNodeRef, isOver, active } = useDroppable({
    id: `client-${client.id}`,
    data: { clientId: client.id, client },
  });

  const isDraggingUser = active?.id?.toString().startsWith('user-');
  const isValidDrop = isOver && isDraggingUser;

  return (
    <ClientCardContextMenu
      clientId={client.id}
      clientName={client.name}
      isActive={client.isActive}
      onToggleStatus={onToggleClientStatus}
    >
      <div
        ref={setNodeRef}
        className={cn(
          'flex items-center gap-2 p-3 transition-all cursor-pointer border-l-4',
          isExpanded
            ? 'bg-gradient-to-r from-primary/5 to-transparent border-l-primary'
            : 'hover:bg-muted/20 border-l-transparent hover:border-l-primary/30',
          isValidDrop && 'bg-primary/15 border-l-primary shadow-md ring-2 ring-primary/20',
          isOver && !isValidDrop && 'bg-muted/30'
        )}
        onClick={() => onToggleClient(client.id)}
      >
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onToggleClient(client.id);
          }}
        >
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>

        <div className="p-1 rounded-md bg-primary/10 shrink-0 hidden xs:block">
          <Building2 className="h-3.5 w-3.5 text-primary" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Link
              href={`/clients/${client.id}`}
              className="font-bold text-[hsl(var(--sr-primary-dark))] hover:underline truncate text-sm md:text-base leading-none"
              onClick={(e) => e.stopPropagation()}
            >
              {highlightText(client.name, searchQuery)}
            </Link>
            <div className="flex items-center gap-1">
              <Badge variant="outline" className="shrink-0 text-[10px] px-1 font-bold">
                {highlightText(client.code, searchQuery)}
              </Badge>
              {client.industry && (
                <Badge
                  variant="secondary"
                  className="shrink-0 text-[10px] px-1 hidden sm:inline-flex"
                >
                  {client.industry}
                </Badge>
              )}
              <Badge
                variant={client.isActive ? 'default' : 'secondary'}
                className="shrink-0 text-xs font-bold"
              >
                {client.isActive ? '활성' : '비활성'}
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="flex items-center gap-1 px-2 py-1">
            <Users className="h-3 w-3" />
            {userCount}명
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onAddUser(client.id);
            }}
            className="hidden sm:flex"
          >
            <Plus className="h-4 w-4 mr-1" />
            사용자 추가
          </Button>
        </div>
      </div>
    </ClientCardContextMenu>
  );
}

export function OrganizationTree({
  clients,
  expandedClients,
  clientUsers,
  onToggleClient,
  onAddUser,
  onToggleClientStatus,
  onToggleUserStatus,
  onDragEnd,
  onDragStart,
  onDragOver,
  searchQuery,
}: OrganizationTreeProps) {
  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px 이동 후 드래그 시작
      },
    })
  );

  // 드래그 중인 사용자 상태
  const [activeUser, setActiveUser] = useState<User | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const user = active.data.current?.user as User | undefined;
    if (user) {
      setActiveUser(user);
    }
    onDragStart?.(event);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveUser(null);
    onDragEnd?.(event);
  };

  // 드래그 프리뷰 컴포넌트
  const renderDragPreview = () => {
    if (!activeUser) return null;

    return (
      <div className="flex items-center gap-3 p-3 rounded-md border bg-white shadow-lg ring-2 ring-primary/20 opacity-95">
        <div className="p-2 rounded-full bg-primary/10 shrink-0">
          <Users className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">{activeUser.name || '이름 없음'}</p>
            <Badge
              variant={activeUser.isActive ? 'default' : 'secondary'}
              className="text-[10px] h-5 px-1.5"
            >
              {activeUser.isActive ? '활성' : '비활성'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate">{activeUser.email || '-'}</p>
        </div>
      </div>
    );
  };

  if (clients.length === 0) {
    return (
      <div className="text-center py-12">
        <Building2 className="h-16 w-16 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-muted-foreground">
          {searchQuery ? '검색 결과가 없습니다.' : '등록된 고객사가 없습니다.'}
        </p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={onDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-2">
        {clients.map((client) => {
          const isExpanded = expandedClients.has(client.id);
          const userCount = client._count?.users || 0;
          const users = clientUsers[client.id] || [];
          const isLoadingUsers = !clientUsers[client.id] && isExpanded && userCount > 0;

          return (
            <div
              key={client.id}
              className="border rounded-lg overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow"
            >
              {/* 고객사 헤더 */}
              <DroppableClientHeader
                client={client}
                isExpanded={isExpanded}
                onToggleClient={onToggleClient}
                onAddUser={onAddUser}
                onToggleClientStatus={onToggleClientStatus}
                searchQuery={searchQuery}
                userCount={userCount}
              />

              {/* 사용자 목록 */}
              {isExpanded && (
                <div className="border-t bg-gradient-to-b from-muted/5 to-transparent">
                  {userCount === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      등록된 사용자가 없습니다.
                    </p>
                  ) : (
                    <div className="p-2 pl-2 md:pl-6 space-y-1.5 relative">
                      {/* 수직 연결선 - 모바일에서 숨김 */}
                      <div className="absolute left-2 md:left-4 top-0 bottom-0 w-px bg-border hidden md:block"></div>

                      {users.map((uc: User | { user: User }) => {
                        const user = 'user' in uc ? uc.user : uc;
                        return (
                          <DraggableUserCard
                            key={user.id || Math.random()}
                            user={user}
                            clientId={client.id}
                            searchQuery={searchQuery}
                            onToggleUserStatus={onToggleUserStatus}
                          />
                        );
                      })}

                      {isLoadingUsers && (
                        <div className="text-center py-4 text-sm text-muted-foreground flex items-center justify-center gap-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                          사용자 정보 로딩 중...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <DragOverlay>{renderDragPreview()}</DragOverlay>
    </DndContext>
  );
}
