"use client";

import Link from "next/link";
import { Building2, Users, ChevronDown, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ClientCardContextMenu } from "./ClientCardContextMenu";
import { UserCardContextMenu } from "./UserCardContextMenu";
import {
    DndContext,
    DragEndEvent,
    PointerSensor,
    useSensor,
    useSensors,
    closestCenter,
    useDraggable,
    useDroppable,
} from "@dnd-kit/core";

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
    searchQuery: string;
}

// 검색어 하이라이트 헬퍼 함수
function highlightText(text: string, query: string) {
    if (!query.trim()) return text;

    const regex = new RegExp(`(${query})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
            ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 px-0.5 rounded">{part}</mark>
            : part
    );
}

// 드래그 가능한 사용자 카드 컴포넌트
function DraggableUserCard({ user, clientId, searchQuery, onToggleUserStatus }: any) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `user-${user.id}`,
        data: { userId: user.id, sourceClientId: clientId, user },
    });

    return (
        <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            className={cn(
                "relative",
                isDragging && "opacity-50"
            )}
        >
            {/* 수평 연결선 */}
            <div className="absolute left-[-16px] top-1/2 w-4 h-px bg-border"></div>

            <UserCardContextMenu
                userId={user.id}
                userName={user.name || "이름 없음"}
                isActive={user.isActive}
                onToggleStatus={onToggleUserStatus}
            >
                <Link
                    href={user.id ? `/users/${user.id}` : "#"}
                    className="flex items-center gap-3 p-3 rounded-md border bg-white hover:bg-accent hover:border-primary/50 hover:shadow-sm transition-all group relative"
                >
                    <div className="p-2 rounded-full bg-muted group-hover:bg-background shrink-0">
                        <Users className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate group-hover:text-primary">
                                {highlightText(user.name || "이름 없음", searchQuery)}
                            </p>
                            <Badge
                                variant={user.isActive ? "default" : "secondary"}
                                className="text-[10px] h-5 px-1.5"
                            >
                                {user.isActive ? "활성" : "비활성"}
                            </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                            {user.email ? highlightText(user.email, searchQuery) : "-"}
                        </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                        {user.roles?.slice(0, 2).map((ur: any) => (
                            <Badge
                                key={ur.role?.name || Math.random()}
                                variant="secondary"
                                className="text-[10px] h-5 px-1.5"
                            >
                                {ur.role?.name}
                            </Badge>
                        ))}
                        {user.roles?.length > 2 && (
                            <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                                +{user.roles.length - 2}
                            </Badge>
                        )}
                    </div>

                    <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
            </UserCardContextMenu>
        </div>
    );
}

// 드롭 가능한 고객사 헤더 컴포넌트
function DroppableClientHeader({ client, isExpanded, onToggleClient, onAddUser, onToggleClientStatus, searchQuery, userCount }: any) {
    const { setNodeRef, isOver } = useDroppable({
        id: `client-${client.id}`,
        data: { clientId: client.id, client },
    });

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
                    "flex items-center gap-3 p-4 transition-all cursor-pointer border-l-4",
                    isExpanded
                        ? "bg-gradient-to-r from-primary/5 to-transparent border-l-primary"
                        : "hover:bg-muted/20 border-l-transparent hover:border-l-primary/30",
                    isOver && "bg-primary/10 border-l-primary"
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
                    {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                    ) : (
                        <ChevronRight className="h-4 w-4" />
                    )}
                </Button>

                <div className="p-2 rounded-md bg-primary/10 shrink-0">
                    <Building2 className="h-5 w-5 text-primary" />
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Link
                            href={`/clients/${client.id}`}
                            className="font-semibold text-[hsl(var(--sr-primary-dark))] hover:underline truncate text-lg"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {highlightText(client.name, searchQuery)}
                        </Link>
                        <Badge variant="outline" className="shrink-0">
                            {highlightText(client.code, searchQuery)}
                        </Badge>
                        {client.industry && (
                            <Badge variant="secondary" className="shrink-0">
                                {client.industry}
                            </Badge>
                        )}
                        <Badge
                            variant={client.isActive ? "default" : "secondary"}
                            className="shrink-0"
                        >
                            {client.isActive ? "활성" : "비활성"}
                        </Badge>
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

    if (clients.length === 0) {
        return (
            <div className="text-center py-12">
                <Building2 className="h-16 w-16 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">
                    {searchQuery ? "검색 결과가 없습니다." : "등록된 고객사가 없습니다."}
                </p>
            </div>
        );
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
        >
            <div className="space-y-2">
                {clients.map((client) => {
                    const isExpanded = expandedClients.has(client.id);
                    const userCount = client._count?.users || 0;
                    const users = clientUsers[client.id] || [];
                    const isLoadingUsers = !clientUsers[client.id] && isExpanded && userCount > 0;

                    return (
                        <div key={client.id} className="border rounded-lg overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow">
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
                                        <div className="p-4 pl-12 space-y-2 relative">
                                            {/* 수직 연결선 */}
                                            <div className="absolute left-8 top-0 bottom-0 w-px bg-border"></div>

                                            {users.map((uc: any) => {
                                                const user = uc.user || uc;
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
        </DndContext>
    );
}
