"use client";

import { useState, useEffect } from "react";
import { Plus, Search, UserCheck, UserX, Shield } from "lucide-react";
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

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [assignRolesDialogOpen, setAssignRolesDialogOpen] = useState(false);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const { toast } = useToast();

  const fetchUsers = async () => {
    try {
      const response = await fetch("/api/users");
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

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (searchQuery === "") {
      setFilteredUsers(users);
    } else {
      const filtered = users.filter(
        (user) =>
          user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          user.email.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredUsers(filtered);
    }
  }, [searchQuery, users]);

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
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>사용자 목록</CardTitle>
              <CardDescription>
                총 {users.length}명의 사용자가 있습니다.
                {searchQuery && ` (검색 결과: ${filteredUsers.length}명)`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 w-full max-w-sm">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="이름 또는 이메일로 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1"
              />
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
