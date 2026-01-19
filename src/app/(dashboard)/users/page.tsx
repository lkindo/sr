'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  Building2,
  CheckSquare,
  Grid,
  List,
  Plus,
  Search,
  Shield,
  Square,
  UserCheck,
  UserX,
} from 'lucide-react';

import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AssignRolesDialog } from '@/components/users/AssignRolesDialog';
import { ClientAssignDropdown } from '@/components/users/ClientAssignDropdown';
import { ClientBadgeWithActions } from '@/components/users/ClientBadgeWithActions';
import { UserDialog } from '@/components/users/UserDialog';
import { usePermissions } from '@/hooks/use-permissions';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface User {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  createdAt: string;
  userType: 'ENGINEER' | 'CLIENT';
  roles: Array<{
    role: {
      id: string;
      name: string;
    };
  }>;
  clients: Array<{
    client: {
      id: string;
      name: string;
      code: string;
    };
  }>;
}

interface Role {
  id: string;
  name: string;
  description?: string;
}

interface Client {
  id: string;
  name: string;
  code: string;
}

interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// 사용자 유형 판별 함수
const getUserTypeLabel = (user: User): string => {
  // 1. Admin 역할이 있으면 시스템 관리자
  const hasAdminRole = user.roles.some((ur) => ur.role.name === 'ADMIN');
  if (hasAdminRole) {
    return '시스템 운영팀';
  }

  // 2. 엔지니어 타입이면 SR 처리자
  if (user.userType === 'ENGINEER') {
    return '기술 지원팀';
  }

  // 3. 고객사 타입이거나 고객사에 소속되어 있으면 SR 요청자
  if (user.userType === 'CLIENT' || user.clients.length > 0) {
    return '고객사 담당자';
  }

  // 기본값
  return '미분류';
};

// 유형별 배지 색상 결정
const getUserTypeBadgeVariant = (typeLabel: string) => {
  switch (typeLabel) {
    case '시스템 운영팀':
      return 'destructive' as const;
    case '기술 지원팀':
      return 'default' as const;
    case '고객사 담당자':
      return 'outline' as const;
    default:
      return 'secondary' as const;
  }
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grouped'>('list');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [assignRolesDialogOpen, setAssignRolesDialogOpen] = useState(false);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [bulkAssignClientId, setBulkAssignClientId] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  // Pagination & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [userTypeFilter, setUserTypeFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
  });

  const { toast } = useToast();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { hasRole, hasAnyRole } = usePermissions();
  const { data: session, update } = useSession();

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', pagination.page.toString());
      params.append('pageSize', pagination.pageSize.toString());
      if (searchQuery) params.append('search', searchQuery);
      if (userTypeFilter !== 'all') params.append('userType', userTypeFilter);
      if (roleFilter !== 'all') params.append('roleId', roleFilter);
      if (statusFilter !== 'all') params.append('isActive', statusFilter);
      if (clientFilter !== 'all') params.append('clientId', clientFilter);

      const response = await fetch(`/api/users?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch users');
      const result = await response.json();

      setUsers(result.data);
      setPagination((prev) => ({
        ...prev,
        total: result.meta.total,
        totalPages: result.meta.totalPages,
      }));
    } catch (error) {
      toast({
        title: '오류',
        description: '사용자 목록을 불러오는데 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [
    pagination.page,
    pagination.pageSize,
    searchQuery,
    userTypeFilter,
    roleFilter,
    statusFilter,
    clientFilter,
    toast,
  ]);

  useEffect(() => {
    const fetchRoles = async () => {
      try {
        const response = await fetch('/api/roles');
        if (!response.ok) throw new Error('Failed to fetch roles');
        const data = await response.json();
        setRoles(data);
      } catch (error) {
        console.error('역할 목록 조회 실패:', error);
      }
    };

    const fetchClients = async () => {
      try {
        const response = await fetch('/api/clients?pageSize=100');
        if (!response.ok) throw new Error('Failed to fetch clients');
        const result = await response.json();
        const clientData = Array.isArray(result) ? result : result.data || [];
        setClients(clientData);
      } catch (error) {
        console.error('고객사 목록 조회 실패:', error);
      }
    };

    fetchRoles();
    fetchClients();
    fetchUsers();
  }, [fetchUsers]);

  const handleToggleActive = async (userId: string, isActive: boolean) => {
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !isActive }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          errorData.error || errorData.message || '사용자 상태 변경에 실패했습니다.';
        throw new Error(errorMessage);
      }

      const updatedUser = await response.json();

      // 즉시 로컬 상태 업데이트
      setUsers((prevUsers) =>
        prevUsers.map((user) =>
          user.id === userId ? { ...user, isActive: updatedUser.isActive ?? !isActive } : user
        )
      );

      toast({
        title: '성공',
        description: `사용자가 ${!isActive ? '활성화' : '비활성화'}되었습니다.`,
      });

      // 백그라운드에서 최신 데이터 가져오기
      fetchUsers();
    } catch (error) {
      console.error('사용자 상태 변경 오류:', error);
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : '사용자 상태 변경에 실패했습니다.',
        variant: 'destructive',
      });
    }
  };

  const handleAssignRoles = (user: User) => {
    setSelectedUser(user);
    setAssignRolesDialogOpen(true);
  };

  const handleCreateUser = () => {
    setSelectedUser(null);
    setUserDialogOpen(true);
  };

  const handleDeleteUser = async (userId: string, isHardDelete: boolean = false) => {
    try {
      const url = isHardDelete ? `/api/users/${userId}?hard=true` : `/api/users/${userId}`;
      const res = await fetch(url, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errorMessage = errorData.error || errorData.message || '삭제 실패';

        // Provide more specific error messages based on the error content
        let detailedMessage = errorMessage;

        if (errorMessage.includes('본인 계정은 삭제할 수 없습니다')) {
          detailedMessage = '자신의 계정은 삭제할 수 없습니다.';
        } else if (errorMessage.includes('진행 중인 SR이 할당되어 있습니다')) {
          // 서버에서 보낸 상세 메시지(SR 번호 포함)를 그대로 사용
          detailedMessage = errorMessage;
        } else if (errorMessage.includes('시스템 운영팀')) {
          detailedMessage = '시스템 운영팀 사용자는 삭제할 수 없습니다.';
        } else if (errorMessage.includes('SR 요청 또는 처리 이력')) {
          detailedMessage =
            'SR 요청/처리 이력이 있는 사용자는 완전히 삭제할 수 없습니다. 비활성화 상태를 유지해주세요.';
        }

        throw new Error(detailedMessage);
      }

      toast({
        title: isHardDelete ? '완전 삭제 완료' : '비활성화 완료',
        description: isHardDelete
          ? '사용자가 영구적으로 삭제되었습니다.'
          : '사용자가 성공적으로 비활성화되었습니다.',
      });

      await fetchUsers();
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : '사용자 삭제에 실패했습니다.';
      toast({
        title: '삭제 실패',
        description: errorMessage,
        variant: 'destructive',
      });
      throw e;
    }
  };

  const onUserSaved = () => {
    fetchUsers();
    setUserDialogOpen(false);
    setAssignRolesDialogOpen(false);
  };

  const handlePageChange = (newPage: number) => {
    setPagination((prev) => ({ ...prev, page: newPage }));
  };

  // 체크박스 토글
  const handleToggleUser = (userId: string) => {
    setSelectedUserIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  // 전체 선택/해제
  const handleToggleAll = () => {
    if (selectedUserIds.size === users.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(users.map((u) => u.id)));
    }
  };

  // 벌크 할당
  const handleBulkAssign = async () => {
    if (!bulkAssignClientId || selectedUserIds.size === 0) return;

    const selectedClient = clients.find((c) => c.id === bulkAssignClientId);
    if (!selectedClient) return;

    try {
      const promises = Array.from(selectedUserIds).map(async (userId) => {
        const response = await fetch(`/api/users/${userId}/client`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: bulkAssignClientId }),
        });

        const data = await response.json();

        if (!response.ok) {
          return {
            status: 'rejected',
            userId,
            error: data.error || data.details || '알 수 없는 오류',
          };
        }

        return { status: 'fulfilled', userId };
      });

      const results = await Promise.all(promises);
      const successResults = results.filter((r) => r.status === 'fulfilled');
      const failResults = results.filter((r) => r.status === 'rejected');

      if (successResults.length > 0) {
        toast({
          title: '완료',
          description: `${successResults.length}명의 사용자가 ${selectedClient.name}에 할당되었습니다.${
            failResults.length > 0 ? ` (${failResults.length}명 실패)` : ''
          }`,
        });
      }

      if (failResults.length > 0) {
        // 시스템 운영팀 할당 오류 메시지 확인
        const systemTeamErrors = failResults.filter(
          (r) => r.error && (r.error as string).includes('시스템 운영팀')
        );

        if (systemTeamErrors.length > 0) {
          toast({
            title: '할당 제한',
            description: `${systemTeamErrors.length}명은 시스템 운영팀(ADMIN, MANAGER, ENGINEER)이므로 고객사를 할당할 수 없습니다.`,
            variant: 'destructive',
          });
        } else {
          toast({
            title: '일부 실패',
            description: `${failResults.length}명의 사용자 할당에 실패했습니다.`,
            variant: 'destructive',
          });
        }
      }

      fetchUsers();
      setSelectedUserIds(new Set());
      setShowBulkAssign(false);
      setBulkAssignClientId('');
    } catch (error) {
      toast({
        title: '오류',
        description: '일괄 할당 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  // 고객사별로 사용자 그룹핑
  const groupedUsers = useCallback(() => {
    const groups: Record<string, User[]> = {
      '고객사 없음': [],
    };

    users.forEach((user) => {
      if (user.clients.length === 0) {
        groups['고객사 없음'].push(user);
      } else {
        user.clients.forEach((uc) => {
          const clientName = uc.client.name;
          if (!groups[clientName]) {
            groups[clientName] = [];
          }
          groups[clientName].push(user);
        });
      }
    });

    return groups;
  }, [users]);

  return (
    <div className="space-y-6">
      {/* 메인 컨텐츠 카드 */}
      <div className="sr-card-template bg-white">
        {/* 리스트 헤더 */}
        <div className="px-6 py-5 border-b border-[hsl(var(--sr-border))]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-semibold text-[hsl(var(--sr-primary-dark))]">
                사용자 목록
              </h3>
              <div className="flex items-center gap-1 border rounded-md p-1">
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className="h-7 px-2"
                >
                  <List className="h-4 w-4 mr-1" />
                  목록
                </Button>
                <Button
                  variant={viewMode === 'grouped' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grouped')}
                  className="h-7 px-2"
                >
                  <Grid className="h-4 w-4 mr-1" />
                  그룹
                </Button>
              </div>
            </div>
            <PermissionGuard roles={['ADMIN']}>
              <Button onClick={handleCreateUser} className="sr-btn-template-primary">
                <Plus className="mr-2 h-4 w-4" />
                등록
              </Button>
            </PermissionGuard>
          </div>

          {/* 검색 및 필터 영역 */}
          <div className="flex flex-col gap-4 md:flex-row md:items-end mb-4">
            {/* 검색 */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="이름 또는 이메일로 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setPagination((prev) => ({ ...prev, page: 1 }));
                  }
                }}
                className="pl-10 sr-input-template"
              />
            </div>

            {/* 필터들 */}
            <div className="flex gap-2 flex-wrap md:flex-nowrap">
              {/* 고객사 필터 (검색 가능) */}
              <Select
                value={clientFilter}
                onValueChange={(value) => {
                  setClientFilter(value);
                  setClientSearchQuery('');
                  setPagination((prev) => ({ ...prev, page: 1 }));
                }}
              >
                <SelectTrigger className="w-[180px] sr-dropdown-template">
                  <SelectValue placeholder="고객사 전체" />
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 pb-2">
                    <Input
                      placeholder="고객사 검색..."
                      value={clientSearchQuery}
                      onChange={(e) => setClientSearchQuery(e.target.value)}
                      className="h-8"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <SelectItem value="all">고객사 전체</SelectItem>
                  <SelectItem value="unassigned">⚠️ 미할당</SelectItem>
                  {clients
                    .filter((client) =>
                      clientSearchQuery
                        ? client.name.toLowerCase().includes(clientSearchQuery.toLowerCase()) ||
                          client.code.toLowerCase().includes(clientSearchQuery.toLowerCase())
                        : true
                    )
                    .map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name} ({client.code})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>

              {/* 유형 필터 */}
              <Select
                value={userTypeFilter}
                onValueChange={(value) => {
                  setUserTypeFilter(value);
                  setPagination((prev) => ({ ...prev, page: 1 }));
                }}
              >
                <SelectTrigger className="w-[160px] sr-dropdown-template">
                  <SelectValue placeholder="유형 전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">유형 전체</SelectItem>
                  <SelectItem value="ENGINEER">기술 지원팀</SelectItem>
                  <SelectItem value="CLIENT">고객사 담당자</SelectItem>
                </SelectContent>
              </Select>

              {/* 역할 필터 */}
              <Select
                value={roleFilter}
                onValueChange={(value) => {
                  setRoleFilter(value);
                  setPagination((prev) => ({ ...prev, page: 1 }));
                }}
              >
                <SelectTrigger className="w-[160px] sr-dropdown-template">
                  <SelectValue placeholder="역할 전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">역할 전체</SelectItem>
                  <SelectItem value="none">역할 없음</SelectItem>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* 상태 필터 */}
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value);
                  setPagination((prev) => ({ ...prev, page: 1 }));
                }}
              >
                <SelectTrigger className="w-[160px] sr-dropdown-template">
                  <SelectValue placeholder="상태 전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">상태 전체</SelectItem>
                  <SelectItem value="true">활성</SelectItem>
                  <SelectItem value="false">비활성</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Total Count & Bulk Actions - 테이블 바로 위 */}
        <div className="px-6 py-2 border-b border-[hsl(var(--sr-border))] flex justify-between items-center">
          <div className="flex items-center gap-3">
            {selectedUserIds.size > 0 &&
              (() => {
                // 선택된 사용자 중 시스템 운영팀 체크
                const selectedUsers = users.filter((u) => selectedUserIds.has(u.id));
                const systemTeamCount = selectedUsers.filter((u) =>
                  u.roles.some((ur) => ['ADMIN', 'MANAGER', 'ENGINEER'].includes(ur.role.name))
                ).length;
                const clientUserCount = selectedUsers.length - systemTeamCount;

                return (
                  <>
                    <Badge variant="secondary" className="text-sm">
                      {selectedUserIds.size}명 선택됨
                    </Badge>
                    {systemTeamCount > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        ⚠️ 시스템 운영팀 {systemTeamCount}명 포함 (할당 불가)
                      </Badge>
                    )}
                    {showBulkAssign ? (
                      <div className="flex items-center gap-2">
                        <Select value={bulkAssignClientId} onValueChange={setBulkAssignClientId}>
                          <SelectTrigger className="w-[200px] h-8">
                            <SelectValue placeholder="고객사 선택..." />
                          </SelectTrigger>
                          <SelectContent>
                            {clients.map((client) => (
                              <SelectItem key={client.id} value={client.id}>
                                {client.name} ({client.code})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          onClick={handleBulkAssign}
                          disabled={!bulkAssignClientId || clientUserCount === 0}
                          title={clientUserCount === 0 ? '할당 가능한 사용자가 없습니다' : ''}
                        >
                          할당 ({clientUserCount}명)
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setShowBulkAssign(false)}>
                          취소
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowBulkAssign(true)}
                        disabled={clientUserCount === 0}
                        title={clientUserCount === 0 ? '할당 가능한 사용자가 없습니다' : ''}
                      >
                        <Building2 className="mr-2 h-4 w-4" />
                        일괄 할당
                      </Button>
                    )}
                  </>
                );
              })()}
          </div>
          <div className="text-sm text-muted-foreground">
            Total{' '}
            <span className="font-semibold text-[hsl(var(--sr-primary-dark))]">
              {pagination.total}
            </span>{' '}
            items
          </div>
        </div>

        {/* 테이블 영역 */}
        {viewMode === 'list' ? (
          <div className="overflow-x-auto">
            <Table className="sr-table-template">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleToggleAll}
                      className="h-8 w-8 p-0"
                    >
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

                  <TableHead>작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <div className="flex justify-center items-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                        <span className="text-muted-foreground">로딩 중...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
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
                            handleToggleUser(user.id);
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
                          return (
                            <Badge variant={getUserTypeBadgeVariant(typeLabel)}>{typeLabel}</Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex gap-1 flex-wrap justify-center">
                          {(() => {
                            // 시스템 운영팀(ADMIN, MANAGER, ENGINEER)은 고객사 할당 불가
                            const isSystemTeam = user.roles.some((ur) =>
                              ['ADMIN', 'MANAGER', 'ENGINEER'].includes(ur.role.name)
                            );

                            if (isSystemTeam) {
                              return (
                                <Badge
                                  variant="secondary"
                                  className="text-xs text-muted-foreground"
                                >
                                  할당 불가
                                </Badge>
                              );
                            }

                            return user.clients.length === 0 ? (
                              <ClientAssignDropdown
                                userId={user.id}
                                userName={user.name}
                                clients={clients}
                                onAssigned={fetchUsers}
                              />
                            ) : (
                              user.clients.map((uc) => (
                                <ClientBadgeWithActions
                                  key={uc.client.id}
                                  userId={user.id}
                                  userName={user.name}
                                  client={uc.client}
                                  allClients={clients}
                                  onChanged={fetchUsers}
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
                            user.roles.map((ur) => (
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

                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async (e) => {
                              e.stopPropagation();
                              // 세션 업데이트 시도
                              await update();
                              const currentRoles = session?.user?.roles || [];
                              const isAdmin = currentRoles.includes('ADMIN');

                              if (!isAdmin) {
                                toast({
                                  title: '권한 없음',
                                  description: `역할 관리 권한이 없습니다. 현재 역할: ${currentRoles.join(', ') || '없음'}`,
                                  variant: 'destructive',
                                });
                                return;
                              }
                              handleAssignRoles(user);
                            }}
                            className="text-[hsl(var(--sr-gray-medium))] hover:text-[hsl(var(--sr-primary-dark))] hover:bg-transparent"
                          >
                            <Shield className="mr-1 h-4 w-4" />
                            역할 관리
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async (e) => {
                              e.stopPropagation();
                              // 세션 업데이트 시도
                              await update();
                              const currentRoles = session?.user?.roles || [];
                              const hasPermission =
                                currentRoles.includes('ADMIN') || currentRoles.includes('MANAGER');

                              if (!hasPermission) {
                                toast({
                                  title: '권한 없음',
                                  description: `사용자 활성화/비활성화 권한이 없습니다. 현재 역할: ${currentRoles.join(', ') || '없음'}`,
                                  variant: 'destructive',
                                });
                                return;
                              }
                              handleToggleActive(user.id, user.isActive);
                            }}
                            className="text-[hsl(var(--sr-gray-medium))] hover:text-[hsl(var(--sr-primary-dark))] hover:bg-transparent"
                          >
                            {user.isActive ? (
                              <UserX className="mr-1 h-4 w-4" />
                            ) : (
                              <UserCheck className="mr-1 h-4 w-4" />
                            )}
                            {user.isActive ? '비활성화' : '활성화'}
                          </Button>
                          <PermissionGuard roles={['ADMIN']}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async (e) => {
                                e.stopPropagation();
                                // 세션 업데이트 시도
                                await update();
                                const currentRoles = session?.user?.roles || [];
                                const isAdmin = currentRoles.includes('ADMIN');

                                if (!isAdmin) {
                                  toast({
                                    title: '권한 없음',
                                    description: `사용자 삭제 권한이 없습니다. 현재 역할: ${currentRoles.join(', ') || '없음'}`,
                                    variant: 'destructive',
                                  });
                                  return;
                                }

                                // Check if user is trying to delete themselves
                                if (session?.user?.id === user.id) {
                                  toast({
                                    title: '삭제 불가',
                                    description: '자신의 계정은 삭제할 수 없습니다.',
                                    variant: 'destructive',
                                  });
                                  return;
                                }

                                // Check if user has system roles
                                const hasSystemRole = user.roles.some((ur) =>
                                  ['ADMIN', 'MANAGER'].includes(ur.role.name)
                                );

                                if (hasSystemRole) {
                                  toast({
                                    title: '삭제 제한',
                                    description:
                                      '시스템 관리자 계정은 삭제할 수 없습니다. 역할을 변경하거나 비활성화하세요.',
                                    variant: 'destructive',
                                  });
                                  return;
                                }

                                setUserToDelete(user);
                                setDeleteDialogOpen(true);
                              }}
                              className="text-[hsl(var(--sr-gray-medium))] hover:text-destructive hover:bg-transparent"
                            >
                              <UserX className="mr-1 h-4 w-4" />
                              삭제
                            </Button>
                          </PermissionGuard>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-6">
            {Object.entries(groupedUsers()).map(([clientName, users]) => {
              const isUnassigned = clientName === '고객사 없음';
              return (
                <div
                  key={clientName}
                  className={cn(
                    'space-y-3 p-4 rounded-lg border-2 transition-all',
                    isUnassigned
                      ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/20'
                      : 'border-transparent'
                  )}
                >
                  <div className="flex items-center gap-2 pb-2 border-b">
                    {isUnassigned && (
                      <Badge variant="destructive" className="shrink-0">
                        ⚠️ 미할당
                      </Badge>
                    )}
                    <h4 className="text-lg font-semibold text-[hsl(var(--sr-primary-dark))]">
                      {clientName}
                    </h4>
                    <Badge variant="outline" className="ml-auto">
                      {users.length}명
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {users.map((user) => (
                      <Link
                        key={user.id}
                        href={`/users/${user.id}`}
                        className="group p-4 rounded-lg border bg-card hover:bg-accent transition-all duration-200"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate group-hover:text-primary">
                              {user.name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                          </div>
                          <Badge
                            variant={user.isActive ? 'default' : 'secondary'}
                            className="ml-2 shrink-0 text-xs"
                          >
                            {user.isActive ? '활성' : '비활성'}
                          </Badge>
                        </div>
                        <div className="flex gap-1 flex-wrap mt-2">
                          {user.roles.length === 0 ? (
                            <Badge variant="outline" className="text-xs">
                              역할 없음
                            </Badge>
                          ) : (
                            user.roles.slice(0, 2).map((ur) => (
                              <Badge key={ur.role.id} variant="secondary" className="text-xs">
                                {ur.role.name}
                              </Badge>
                            ))
                          )}
                          {user.roles.length > 2 && (
                            <Badge variant="outline" className="text-xs">
                              +{user.roles.length - 2}
                            </Badge>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Controls */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-center py-4 border-t border-[hsl(var(--sr-border))]">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page === 1}
              >
                이전
              </Button>
              <span className="text-sm text-muted-foreground">
                {pagination.page} / {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page === pagination.totalPages}
              >
                다음
              </Button>
            </div>
          </div>
        )}
      </div>

      <UserDialog
        open={userDialogOpen}
        onOpenChange={setUserDialogOpen}
        user={selectedUser}
        onSaved={onUserSaved}
      />

      <AssignRolesDialog
        open={assignRolesDialogOpen}
        onOpenChange={setAssignRolesDialogOpen}
        user={selectedUser}
        onSaved={onUserSaved}
      />

      {/* Delete Confirmation Dialog */}
      {deleteDialogOpen && userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-lg p-6 w-full max-w-md border border-[hsl(var(--sr-border))] shadow-lg">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-[hsl(var(--sr-primary-dark))]">
                {userToDelete.isActive ? '사용자 비활성화 확인' : '사용자 완전 삭제 확인'}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                사용자{' '}
                <span className="font-medium text-[hsl(var(--sr-primary-dark))]">
                  {userToDelete.name}
                </span>{' '}
                (이메일: {userToDelete.email}) 을
                {userToDelete.isActive ? ' 비활성화하시겠습니까?' : ' 완전히 삭제하시겠습니까?'}
              </p>
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-700">
                <p className="font-medium">경고: 이 작업은 되돌릴 수 없습니다.</p>
                {userToDelete.isActive ? (
                  <p>
                    사용자는 비활성화되며, 관련된 SR이 있다면 다른 담당자에게 재할당되어야 합니다.
                  </p>
                ) : (
                  <p className="text-red-600 font-bold">
                    주의: 이 작업은 영구적이며 모든 데이터가 삭제됩니다. SR 이력이 있는 사용자는
                    삭제할 수 없습니다.
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteDialogOpen(false);
                  setUserToDelete(null);
                }}
              >
                취소
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  if (userToDelete) {
                    try {
                      // 이미 비활성화된 상태라면 완전 삭제 시도
                      const isHardDelete = !userToDelete.isActive;
                      await handleDeleteUser(userToDelete.id, isHardDelete);
                      setDeleteDialogOpen(false);
                      setUserToDelete(null);
                    } catch (error) {
                      console.error('Error deleting user:', error);
                      // Error handling is already in handleDeleteUser
                    }
                  }
                }}
              >
                {userToDelete.isActive ? '예, 비활성화합니다' : '예, 완전히 삭제합니다'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
