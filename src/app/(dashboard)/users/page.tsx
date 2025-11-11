"use client";

import { useState, useEffect } from "react";
import { Plus, Search, UserCheck, UserX, Shield, Filter } from "lucide-react";
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

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [userTypeFilter, setUserTypeFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [assignRolesDialogOpen, setAssignRolesDialogOpen] = useState(false);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const { toast } = useToast();

  const fetchUsers = async () => {
    try {
      // 쿼리 파라미터 구성
      const params = new URLSearchParams();
      if (searchQuery) params.append("search", searchQuery);
      if (userTypeFilter !== "all") params.append("userType", userTypeFilter);
      if (roleFilter !== "all") params.append("roleId", roleFilter);
      if (statusFilter !== "all") params.append("isActive", statusFilter);

      const response = await fetch(`/api/users?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch users");
      const data = await response.json();
      setUsers(data);
      setFilteredUsers(data);
    } catch (error) {
      toast({
        title: "오류",
        description: "사용자 목록을 불러오는데 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

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

  useEffect(() => {
    fetchUsers();
    fetchRoles();
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [searchQuery, userTypeFilter, roleFilter, statusFilter]);

  const handleToggleActive = async (userId: string, isActive: boolean) => {
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });

      if (!response.ok) {
        throw new Error("Failed to update user");
      }

      toast({
        title: "성공",
        description: `사용자가 ${!isActive ? "활성화" : "비활성화"}되었습니다.`,
      });

      fetchUsers();
    } catch (error) {
      toast({
        title: "오류",
        description: "사용자 상태 변경에 실패했습니다.",
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">사용자 관리</h1>
          <p className="text-muted-foreground">
            시스템 사용자를 관리합니다.
          </p>
        </div>
        <PermissionGuard roles={["ADMIN"]}>
          <Button onClick={handleCreateUser}>
            <Plus className="mr-2 h-4 w-4" />
            새 사용자 추가
          </Button>
        </PermissionGuard>
      </div>

      <Card>
        <CardHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>사용자 목록</CardTitle>
                <CardDescription>
                  총 {filteredUsers.length}명의 사용자가 있습니다.
                </CardDescription>
              </div>
            </div>

            {/* 검색 및 필터 영역 */}
            <div className="flex flex-col gap-4 md:flex-row md:items-end">
              {/* 검색 */}
              <div className="flex items-center gap-2 flex-1">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="이름 또는 이메일로 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1"
                />
              </div>

              {/* 필터들 */}
              <div className="flex gap-2 flex-wrap md:flex-nowrap">
                {/* 유형 필터 */}
                <Select value={userTypeFilter} onValueChange={setUserTypeFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="유형 전체" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">유형 전체</SelectItem>
                    <SelectItem value="ENGINEER">엔지니어</SelectItem>
                    <SelectItem value="CLIENT">고객사</SelectItem>
                  </SelectContent>
                </Select>

                {/* 역할 필터 */}
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-[160px]">
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
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[160px]">
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
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>유형</TableHead>
                <TableHead>역할</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>가입일</TableHead>
                <TableHead className="text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    {searchQuery
                      ? "검색 결과가 없습니다."
                      : "등록된 사용자가 없습니다."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/users/${user.id}`}
                        className="hover:underline text-primary"
                      >
                        {user.name}
                      </Link>
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          user.userType === "ENGINEER" ? "default" : "outline"
                        }
                      >
                        {user.userType === "ENGINEER"
                          ? "엔지니어"
                          : "고객사"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
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
                    <TableCell>
                      <Badge
                        variant={user.isActive ? "default" : "secondary"}
                      >
                        {user.isActive ? "활성" : "비활성"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(user.createdAt).toLocaleDateString("ko-KR")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <PermissionGuard roles={["ADMIN"]}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAssignRoles(user)}
                          >
                            <Shield className="mr-2 h-4 w-4" />
                            역할 관리
                          </Button>
                        </PermissionGuard>
                        <PermissionGuard roles={["ADMIN", "MANAGER"]}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleToggleActive(user.id, user.isActive)
                            }
                          >
                            {user.isActive ? (
                              <>
                                <UserX className="mr-2 h-4 w-4" />
                                비활성화
                              </>
                            ) : (
                              <>
                                <UserCheck className="mr-2 h-4 w-4" />
                                활성화
                              </>
                            )}
                          </Button>
                        </PermissionGuard>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <UserDialog
        open={userDialogOpen}
        onOpenChange={setUserDialogOpen}
        user={selectedUser}
        onSaved={fetchUsers}
      />

      <AssignRolesDialog
        open={assignRolesDialogOpen}
        onOpenChange={setAssignRolesDialogOpen}
        user={selectedUser}
        onSaved={fetchUsers}
      />
    </div>
  );
}
