'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation'; // useSearchParams 제거
import { useSession } from 'next-auth/react';
import { Plus, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AssignRolesDialog } from '@/components/users/AssignRolesDialog';
import { DeleteUserDialog } from '@/components/users/DeleteUserDialog';
import { UserDialog } from '@/components/users/UserDialog';
import { UserMobileList } from '@/components/users/UserMobileList';
import { UserTable } from '@/components/users/UserTable';
import { useToast } from '@/hooks/use-toast';
import { User } from '@/types/user';

interface PaginationData {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export default function UsersClient() {
  const router = useRouter();
  // useSearchParams를 사용하지 않고 window.location을 직접 사용 (새로고침 에러 방지)
  const { data: session, update } = useSession();
  const { toast } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 초기 상태값 설정 (URL 파라미터는 useEffect에서 로드)
  const [pagination, setPagination] = useState<PaginationData>({
    currentPage: 1,
    pageSize: 10,
    totalItems: 0,
    totalPages: 1,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('true');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  // URL 파라미터 초기화 여부
  const [isInitialized, setIsInitialized] = useState(false);

  // Dialog states
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [isAssignRoleDialogOpen, setIsAssignRoleDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  // 컴포넌트 마운트 시 URL 파라미터 읽기
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const page = Number(params.get('page')) || 1;
      const q = params.get('q') || '';
      // isActive 파라미터가 없으면 기본값 'true' 유지
      const isActive = params.get('isActive');

      setPagination((prev) => ({ ...prev, currentPage: page }));
      setSearchQuery(q);
      if (isActive) setStatusFilter(isActive);

      setIsInitialized(true);
    }
  }, []);

  // URL 업데이트 함수
  const updateUrl = useCallback(
    (page: number, search: string, status: string) => {
      const params = new URLSearchParams();
      if (page > 1) params.set('page', page.toString());
      if (search) params.set('q', search);
      if (status !== 'true') params.set('isActive', status); // 기본값이 아니면 URL에 추가

      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router]
  );

  const fetchUsers = useCallback(async () => {
    if (!isInitialized) return; // 초기화 전에는 실행하지 않음

    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.currentPage.toString(),
        pageSize: pagination.pageSize.toString(),
        search: searchQuery,
        isActive: statusFilter,
      });

      const response = await fetch(`/api/users?${params}`);
      if (!response.ok) throw new Error('Failed to fetch users');

      const result = await response.json();

      if (result && Array.isArray(result.data)) {
        setUsers(result.data);
        if (result.meta) {
          setPagination(result.meta);
        }
      } else if (Array.isArray(result)) {
        setUsers(result);
      }

      setError(null);
    } catch (err) {
      setError('사용자 목록을 불러오는데 실패했습니다.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [pagination.currentPage, pagination.pageSize, searchQuery, statusFilter, isInitialized]);

  // 메타데이터(고객사, 역할) 로딩
  const fetchMetadata = useCallback(async () => {
    try {
      const [clientsRes, rolesRes] = await Promise.all([
        fetch('/api/clients'),
        fetch('/api/roles'),
      ]);

      if (clientsRes.ok) {
        const clientsResult = await clientsRes.json();
        const clientsData =
          clientsResult && Array.isArray(clientsResult.data)
            ? clientsResult.data
            : Array.isArray(clientsResult)
              ? clientsResult
              : [];
        setClients(clientsData);
      }
      if (rolesRes.ok) {
        const rolesData = await rolesRes.json();
        setRoles(Array.isArray(rolesData) ? rolesData : []);
      }
    } catch (error) {
      console.error('Failed to fetch metadata', error);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPagination((prev) => ({ ...prev, currentPage: 1 }));
    updateUrl(1, searchQuery, statusFilter);
  };

  const handlePageChange = (newPage: number) => {
    setPagination((prev) => ({ ...prev, currentPage: newPage }));
    updateUrl(newPage, searchQuery, statusFilter);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setPagination((prev) => ({ ...prev, currentPage: 1 }));
    updateUrl(1, searchQuery, value);
  };

  const handleCreateUser = () => {
    setSelectedUser(null);
    setIsUserDialogOpen(true);
  };

  const handleAssignRoles = (user: User) => {
    setSelectedUser(user);
    setIsAssignRoleDialogOpen(true);
  };

  const handleDeleteUser = (user: User) => {
    setUserToDelete(user);
    setIsDeleteDialogOpen(true);
  };

  const handleToggleActive = async (userId: string, currentStatus: boolean) => {
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentStatus }),
      });

      if (!response.ok) throw new Error('Failed to update status');

      toast({
        title: '상태 변경 완료',
        description: `사용자 계정이 ${!currentStatus ? '활성화' : '비활성화'} 되었습니다.`,
      });
      fetchUsers();
    } catch (error) {
      toast({
        title: '오류 발생',
        description: '상태 변경 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const handleToggleAll = () => {
    if (selectedUserIds.size === users.length && users.length > 0) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(users.map((u) => u.id)));
    }
  };

  const handleToggleUser = (userId: string) => {
    const newSelected = new Set(selectedUserIds);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUserIds(newSelected);
  };

  const handleUserSaved = () => {
    fetchUsers();
    setIsUserDialogOpen(false);
  };

  const handleRolesAssigned = () => {
    fetchUsers();
    setIsAssignRoleDialogOpen(false);
  };

  const handleUserDeleted = () => {
    fetchUsers();
    setIsDeleteDialogOpen(false);
    setUserToDelete(null);
  };

  if (!isInitialized) {
    return (
      <div className="h-96 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="sr-card-template bg-white">
        <div className="px-6 py-5 border-b border-[hsl(var(--sr-border))] space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h3 className="text-xl font-semibold text-[hsl(var(--sr-primary-dark))]">
              사용자 목록
            </h3>
            <div className="flex items-center gap-2 flex-wrap">
              {/* 일괄 작업 버튼 - 선택 시에만 표시 */}
              {selectedUserIds.size > 0 &&
                (() => {
                  // 선택된 사용자들의 상태 분석
                  const selectedUsers = users.filter((u) => selectedUserIds.has(u.id));
                  const hasActiveUsers = selectedUsers.some((u) => u.isActive);
                  const hasInactiveUsers = selectedUsers.some((u) => !u.isActive);
                  const allInactive = selectedUsers.every((u) => !u.isActive);

                  return (
                    <div className="flex items-center gap-2 mr-2 px-3 py-1.5 bg-muted/50 rounded-lg">
                      <span className="text-sm text-muted-foreground font-medium">
                        {selectedUserIds.size}명 선택
                      </span>

                      {/* 역할 관리 - 1명 선택 시에만 활성화 */}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={selectedUserIds.size !== 1}
                        title={selectedUserIds.size !== 1 ? '1명만 선택해주세요' : '역할 관리'}
                        onClick={() => {
                          const firstUserId = Array.from(selectedUserIds)[0];
                          const user = users.find((u) => u.id === firstUserId);
                          if (user) handleAssignRoles(user);
                        }}
                      >
                        역할 관리
                      </Button>

                      {/* 일괄 활성화 - 비활성 사용자가 있을 때만 표시 */}
                      {hasInactiveUsers && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs text-green-600 hover:bg-green-50"
                          onClick={() => {
                            selectedUsers
                              .filter((u) => !u.isActive)
                              .forEach((u) => handleToggleActive(u.id, true));
                          }}
                        >
                          일괄 활성화
                        </Button>
                      )}

                      {/* 일괄 비활성화 - 활성 사용자가 있을 때만 표시 */}
                      {hasActiveUsers && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs text-orange-600 hover:bg-orange-50"
                          onClick={() => {
                            selectedUsers
                              .filter((u) => u.isActive)
                              .forEach((u) => handleToggleActive(u.id, false));
                          }}
                        >
                          일괄 비활성화
                        </Button>
                      )}

                      {/* 삭제 - 비활성 사용자만 선택 시 활성화 */}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs text-destructive hover:bg-destructive/10"
                        disabled={!allInactive}
                        title={
                          !allInactive
                            ? '비활성 사용자만 삭제 가능합니다. 먼저 비활성화하세요.'
                            : '선택한 사용자 삭제'
                        }
                        onClick={() => {
                          const firstUserId = Array.from(selectedUserIds)[0];
                          const user = users.find((u) => u.id === firstUserId);
                          if (user) {
                            setUserToDelete(user);
                            setIsDeleteDialogOpen(true);
                          }
                        }}
                      >
                        삭제
                      </Button>
                    </div>
                  );
                })()}
              <Button onClick={handleCreateUser} className="sr-btn-template-primary">
                <Plus className="mr-2 h-4 w-4" />
                사용자 등록
              </Button>
            </div>
          </div>

          {/* 필터 영역 - 데스크톱/모바일 최적화 */}
          <div className="flex flex-col gap-2">
            {/* Status Tabs (Mobile: Scrollable / Desktop: Flex) */}
            <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar -mx-2 px-2 md:mx-0 md:px-0">
              {[
                { label: '활성', value: 'true' },
                { label: '비활성', value: 'false' },
                { label: '전체', value: 'all' },
              ].map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => handleStatusChange(tab.value)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap transition-all border ${
                    statusFilter === tab.value
                      ? 'bg-[hsl(var(--sr-primary-dark))] text-white border-[hsl(var(--sr-primary-dark))] shadow-sm'
                      : 'bg-white text-muted-foreground border-border hover:bg-muted'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search Bar */}
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="이름, 이메일 검색..."
                  className="pl-9 h-9 text-sm bg-background rounded-full border-muted-foreground/20 focus-visible:ring-primary/20"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Button
                type="submit"
                size="sm"
                variant="secondary"
                className="h-9 px-4 rounded-full bg-[hsl(var(--sr-primary-dark))] text-white hover:bg-[hsl(var(--sr-primary-dark))/90] shrink-0"
              >
                검색
              </Button>
            </form>
          </div>
        </div>

        <div className="px-6 py-2 border-b border-[hsl(var(--sr-border))] flex justify-end bg-slate-50/50">
          <div className="text-xs text-muted-foreground font-medium">
            전체{' '}
            <span className="text-[hsl(var(--sr-primary-dark))] font-bold">
              {pagination.totalItems}
            </span>
            명
          </div>
        </div>

        <UserTable
          users={users}
          loading={loading}
          searchQuery={searchQuery}
          selectedUserIds={selectedUserIds}
          clients={clients}
          onToggleAll={handleToggleAll}
          onToggleUser={handleToggleUser}
          onAssignRoles={handleAssignRoles}
          onToggleActive={handleToggleActive}
          onDelete={handleDeleteUser}
          onRefresh={fetchUsers}
        />

        <UserMobileList
          users={users}
          loading={loading}
          searchQuery={searchQuery}
          selectedUserIds={selectedUserIds}
          clients={clients}
          onToggleUser={handleToggleUser}
          onAssignRoles={handleAssignRoles}
          onToggleActive={handleToggleActive}
          onDelete={handleDeleteUser}
          onRefresh={fetchUsers}
        />

        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-center py-4 border-t border-[hsl(var(--sr-border))]">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(pagination.currentPage - 1)}
                disabled={pagination.currentPage === 1}
              >
                이전
              </Button>
              <span className="text-sm text-muted-foreground">
                {pagination.currentPage} / {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(pagination.currentPage + 1)}
                disabled={pagination.currentPage === pagination.totalPages}
              >
                다음
              </Button>
            </div>
          </div>
        )}
      </div>

      <UserDialog
        open={isUserDialogOpen}
        onOpenChange={setIsUserDialogOpen}
        user={selectedUser}
        roles={roles}
        clients={clients}
        onSaved={handleUserSaved}
      />

      <AssignRolesDialog
        open={isAssignRoleDialogOpen}
        onOpenChange={setIsAssignRoleDialogOpen}
        user={selectedUser}
        availableRoles={roles}
        onSaved={handleRolesAssigned}
      />

      <DeleteUserDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        user={userToDelete}
        onDeleted={handleUserDeleted}
      />
    </div>
  );
}
