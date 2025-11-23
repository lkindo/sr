"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Search, UserCheck, UserX, Shield, Filter, List, Grid } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { AssignRolesDialog } from "@/components/users/AssignRolesDialog";
import { UserDialog } from "@/components/users/UserDialog";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { usePermissions } from "@/hooks/use-permissions";
import { useSession } from "next-auth/react";

interface User {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  createdAt: string;
  userType: "ENGINEER" | "CLIENT";
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

// 사용자 유형 판별 함수
const getUserTypeLabel = (user: User): string => {
  // 1. Admin 역할이 있으면 시스템 관리자
  const hasAdminRole = user.roles.some((ur) => ur.role.name === "ADMIN");
  if (hasAdminRole) {
    return "시스템 운영팀";
  }

  // 2. 엔지니어 타입이면 SR 처리자
  if (user.userType === "ENGINEER") {
    return "기술 지원팀";
  }

  // 3. 고객사 타입이거나 고객사에 소속되어 있으면 SR 요청자
  if (user.userType === "CLIENT" || user.clients.length > 0) {
    return "고객사 담당자";
  }

  // 기본값
  return "미분류";
};

// 유형별 배지 색상 결정
const getUserTypeBadgeVariant = (typeLabel: string) => {
  switch (typeLabel) {
    case "시스템 운영팀":
      return "destructive" as const;
    case "기술 지원팀":
      return "default" as const;
    case "고객사 담당자":
      return "outline" as const;
    default:
      return "secondary" as const;
  }
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [userTypeFilter, setUserTypeFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grouped">("list");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [assignRolesDialogOpen, setAssignRolesDialogOpen] = useState(false);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const { toast} = useToast();
  const { hasRole, hasAnyRole } = usePermissions();
  const { data: session, update } = useSession();

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append("search", searchQuery);
      if (userTypeFilter !== "all") params.append("userType", userTypeFilter);
      if (roleFilter !== "all") params.append("roleId", roleFilter);
      if (statusFilter !== "all") params.append("isActive", statusFilter);
      if (clientFilter !== "all") params.append("clientId", clientFilter);

      const response = await fetch(`/api/users?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch users");
      const data = await response.json();
      setUsers(data);
      setFilteredUsers(data); // Assuming the API does the filtering
    } catch (error) {
      toast({
        title: "오류",
        description: "사용자 목록을 불러오는데 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [searchQuery, userTypeFilter, roleFilter, statusFilter, clientFilter, toast]);

  useEffect(() => {
    const fetchRoles = async () => {
      try {
        const response = await fetch("/api/roles");
        if (!response.ok) throw new Error("Failed to fetch roles");
        const data = await response.json();
        setRoles(data);
      } catch (error) {
        console.error("역할 목록 조회 실패:", error);
      }
    };

    const fetchClients = async () => {
      try {
        const response = await fetch("/api/clients?pageSize=100");
        if (!response.ok) throw new Error("Failed to fetch clients");
        const result = await response.json();
        const clientData = Array.isArray(result) ? result : (result.data || []);
        setClients(clientData);
      } catch (error) {
        console.error("고객사 목록 조회 실패:", error);
      }
    };

    fetchRoles();
    fetchClients();
    fetchUsers();
  }, [fetchUsers]);


  const handleToggleActive = async (userId: string, isActive: boolean) => {
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || errorData.message || "사용자 상태 변경에 실패했습니다.";
        throw new Error(errorMessage);
      }

      const updatedUser = await response.json();

      // 즉시 로컬 상태 업데이트
      setUsers((prevUsers) =>
        prevUsers.map((user) =>
          user.id === userId ? { ...user, isActive: updatedUser.isActive ?? !isActive } : user
        )
      );
      setFilteredUsers((prevUsers) =>
        prevUsers.map((user) =>
          user.id === userId ? { ...user, isActive: updatedUser.isActive ?? !isActive } : user
        )
      );

      toast({
        title: "성공",
        description: `사용자가 ${!isActive ? "활성화" : "비활성화"}되었습니다.`,
      });

      // 백그라운드에서 최신 데이터 가져오기
      fetchUsers();
    } catch (error) {
      console.error("사용자 상태 변경 오류:", error);
      toast({
        title: "오류",
        description: error instanceof Error ? error.message : "사용자 상태 변경에 실패했습니다.",
        variant: "destructive",
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

  const onUserSaved = () => {
    fetchUsers();
    setUserDialogOpen(false);
    setAssignRolesDialogOpen(false);
  };

  // 고객사별로 사용자 그룹핑
  const groupedUsers = useCallback(() => {
    const groups: Record<string, User[]> = {
      "고객사 없음": [],
    };

    filteredUsers.forEach((user) => {
      if (user.clients.length === 0) {
        groups["고객사 없음"].push(user);
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
  }, [filteredUsers]);


  if (loading && users.length === 0) { // 초기 로딩 시에만 전체 화면 로딩 표시
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 메인 컨텐츠 카드 */}
      <div className="sr-card-template bg-white">
        {/* 리스트 헤더 */}
        <div className="px-6 py-5 border-b border-[hsl(var(--sr-border))]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-semibold text-[hsl(var(--sr-primary-dark))]">사용자 목록</h3>
              <div className="flex items-center gap-1 border rounded-md p-1">
                <Button
                  variant={viewMode === "list" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("list")}
                  className="h-7 px-2"
                >
                  <List className="h-4 w-4 mr-1" />
                  목록
                </Button>
                <Button
                  variant={viewMode === "grouped" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("grouped")}
                  className="h-7 px-2"
                >
                  <Grid className="h-4 w-4 mr-1" />
                  그룹
                </Button>
              </div>
            </div>
            <PermissionGuard roles={["ADMIN"]}>
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
                    fetchUsers();
                  }
                }}
                className="pl-10 sr-input-template"
              />
            </div>

            {/* 필터들 */}
            <div className="flex gap-2 flex-wrap md:flex-nowrap">
              {/* 고객사 필터 (검색 가능) */}
              <Select value={clientFilter} onValueChange={(value) => {
                setClientFilter(value);
                setClientSearchQuery("");
              }}>
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
              <Select value={userTypeFilter} onValueChange={(value) => {
                setUserTypeFilter(value);
                // fetchUsers는 useEffect의 의존성 배열을 통해 자동 호출됨
              }}>
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
              <Select value={roleFilter} onValueChange={(value) => {
                setRoleFilter(value);
                // fetchUsers는 useEffect의 의존성 배열을 통해 자동 호출됨
              }}>
                <SelectTrigger className="w-[160px] sr-dropdown-template">
                  <SelectValue placeholder="역할 전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">역할 전체</SelectItem>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* 상태 필터 */}
              <Select value={statusFilter} onValueChange={(value) => {
                setStatusFilter(value);
                // fetchUsers는 useEffect의 의존성 배열을 통해 자동 호출됨
              }}>
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

        {/* Total Count - 테이블 바로 위 */}
        <div className="px-6 py-2 border-b border-[hsl(var(--sr-border))] flex justify-end">
          <div className="text-sm text-muted-foreground">
            Total <span className="font-semibold text-[hsl(var(--sr-primary-dark))]">{filteredUsers.length}</span> items
          </div>
        </div>

        {/* 테이블 영역 */}
        {viewMode === "list" ? (
          <div className="overflow-x-auto">
            <Table className="sr-table-template">
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>유형</TableHead>
                <TableHead>고객사</TableHead>
                <TableHead>역할</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>가입일</TableHead>
                <TableHead>작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && users.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8">로딩 중...</TableCell></TableRow>
              ) : filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    {searchQuery
                      ? "검색 결과가 없습니다."
                      : "등록된 사용자가 없습니다."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => (
                  <TableRow key={user.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell className="font-medium text-center">
                      <Link
                        href={`/users/${user.id}`}
                        className="text-primary hover:underline"
                      >
                        {user.name}
                      </Link>
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell className="text-center">
                      {(() => {
                        const typeLabel = getUserTypeLabel(user);
                        return (
                          <Badge variant={getUserTypeBadgeVariant(typeLabel)}>
                            {typeLabel}
                          </Badge>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex gap-1 flex-wrap justify-center">
                        {user.clients.length === 0 ? (
                          <Badge variant="outline">-</Badge>
                        ) : (
                          user.clients.map((uc) => (
                            <Link key={uc.client.id} href={`/clients/${uc.client.id}`}>
                              <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">
                                {uc.client.name}
                              </Badge>
                            </Link>
                          ))
                        )}
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
                      <Badge
                        variant={user.isActive ? "default" : "secondary"}
                      >
                        {user.isActive ? "활성" : "비활성"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {new Date(user.createdAt).toLocaleDateString("ko-KR", {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit'
                      }).replace(/\./g, '. ').trim()}
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
                            const isAdmin = currentRoles.includes("ADMIN");

                            if (!isAdmin) {
                              toast({
                                title: "권한 없음",
                                description: `역할 관리 권한이 없습니다. 현재 역할: ${currentRoles.join(", ") || "없음"}`,
                                variant: "destructive",
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
                            const hasPermission = currentRoles.includes("ADMIN") || currentRoles.includes("MANAGER");

                            if (!hasPermission) {
                              toast({
                                title: "권한 없음",
                                description: `사용자 활성화/비활성화 권한이 없습니다. 현재 역할: ${currentRoles.join(", ") || "없음"}`,
                                variant: "destructive",
                              });
                              return;
                            }
                            handleToggleActive(user.id, user.isActive);
                          }}
                          className="text-[hsl(var(--sr-gray-medium))] hover:text-[hsl(var(--sr-primary-dark))] hover:bg-transparent"
                        >
                          {user.isActive ? (
                            <>
                              <UserX className="mr-1 h-4 w-4" />
                              비활성화
                            </>
                          ) : (
                            <>
                              <UserCheck className="mr-1 h-4 w-4" />
                              활성화
                            </>
                          )}
                        </Button>
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
            {Object.entries(groupedUsers()).map(([clientName, users]) => (
              <div key={clientName} className="space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b">
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
                          <p className="text-xs text-muted-foreground truncate">
                            {user.email}
                          </p>
                        </div>
                        <Badge
                          variant={user.isActive ? "default" : "secondary"}
                          className="ml-2 shrink-0 text-xs"
                        >
                          {user.isActive ? "활성" : "비활성"}
                        </Badge>
                      </div>
                      <div className="flex gap-1 flex-wrap mt-2">
                        {user.roles.length === 0 ? (
                          <Badge variant="outline" className="text-xs">
                            역할 없음
                          </Badge>
                        ) : (
                          user.roles.slice(0, 2).map((ur) => (
                            <Badge
                              key={ur.role.id}
                              variant="secondary"
                              className="text-xs"
                            >
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
            ))}
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
    </div>
  );
}
