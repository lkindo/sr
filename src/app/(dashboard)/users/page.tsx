'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Plus, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

export default function UsersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, update } = useSession();
  const { toast } = useToast();

  // URL에서 초기 상태 로드
  const initialPage = Number(searchParams.get('page')) || 1;
  const initialSearch = searchParams.get('q') || '';

  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<any[]>([]); // 고객사 목록
  const [roles, setRoles] = useState<any[]>([]); // 역할 목록
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationData>({
    currentPage: initialPage,
    pageSize: 10,
    totalItems: 0,
    totalPages: 1,
  });
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  // Dialog states
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [isAssignRoleDialogOpen, setIsAssignRoleDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  // URL 업데이트 함수
  const updateUrl = useCallback(
    (page: number, search: string) => {
      const params = new URLSearchParams();
      if (page > 1) params.set('page', page.toString());
      if (search) params.set('q', search);
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router]
  );

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.currentPage.toString(),
        pageSize: pagination.pageSize.toString(),
        search: searchQuery,
      });

      const response = await fetch(`/api/users?${params}`);
      if (!response.ok) throw new Error('Failed to fetch users');

      const result = await response.json();
      setUsers(result.data);
      setPagination(result.meta);
      setError(null);
    } catch (err) {
      setError('사용자 목록을 불러오는데 실패했습니다.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [pagination.currentPage, pagination.pageSize, searchQuery]);

  // Clients & Roles fetching (for dropdowns)
  const fetchMetadata = useCallback(async () => {
    try {
      const [clientsRes, rolesRes] = await Promise.all([
        fetch('/api/clients'),
        fetch('/api/roles'),
      ]);

      if (clientsRes.ok) {
        setClients(await clientsRes.json());
      }
      if (rolesRes.ok) {
        const rolesData = await rolesRes.json();
        setRoles(rolesData);
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

  // 검색어 변경 핸들러 (디바운스 적용 권장하지만 여기선 간단히)
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPagination((prev) => ({ ...prev, currentPage: 1 }));
    updateUrl(1, searchQuery);
  };

  const handlePageChange = (newPage: number) => {
    setPagination((prev) => ({ ...prev, currentPage: newPage }));
    updateUrl(newPage, searchQuery);
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
      const response = await fetch(`/api/users/${userId}/status`, {
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

  return (
    <div className="space-y-6">
      {/* 메인 컨텐츠 카드 */}
      <div className="sr-card-template bg-white">
        {/* 리스트 헤더 & 필터 */}
        <div className="px-6 py-5 border-b border-[hsl(var(--sr-border))] space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h3 className="text-xl font-semibold text-[hsl(var(--sr-primary-dark))]">
              사용자 목록
            </h3>
            <div className="flex items-center gap-2">
              <Button onClick={handleCreateUser} className="sr-btn-template-primary">
                <Plus className="mr-2 h-4 w-4" />
                사용자 등록
              </Button>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-4">
            <form onSubmit={handleSearch} className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="이름, 이메일 검색..."
                className="pl-9 bg-background"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </form>
          </div>
        </div>

        {/* Total Count */}
        <div className="px-6 py-2 border-b border-[hsl(var(--sr-border))] flex justify-end">
          <div className="text-sm text-muted-foreground">
            Total{' '}
            <span className="font-semibold text-[hsl(var(--sr-primary-dark))]">
              {pagination.totalItems}
            </span>{' '}
            items
          </div>
        </div>

        {/* Desktop View */}
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

        {/* Mobile View */}
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

        {/* Pagination Controls */}
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
