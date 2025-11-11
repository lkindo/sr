"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Shield } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserDialog } from "@/components/users/UserDialog";
import { AssignRolesDialog } from "@/components/users/AssignRolesDialog";
import { useToast } from "@/hooks/use-toast";
import { PermissionGuard } from "@/components/auth/PermissionGuard";

interface Permission {
  permission: {
    id: string;
    resource: string;
    action: string;
    description?: string;
  };
}

interface Role {
  role: {
    id: string;
    name: string;
    description?: string;
    permissions: Permission[];
  };
}

interface User {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  roles: Role[];
  clients: Array<{
    client: {
      id: string;
      name: string;
      code: string;
    };
  }>;
}

// 사용자 유형 판별 함수
const getUserTypeLabel = (user: User): string => {
  // 1. Admin 역할이 있으면 시스템 관리자
  const hasAdminRole = user.roles.some((ur) => ur.role.name === "ADMIN");
  if (hasAdminRole) {
    return "시스템 관리자";
  }

  // 2. 고객사에 소속되어 있으면 SR 요청자
  if (user.clients.length > 0) {
    return "SR 요청자";
  }

  // 3. 고객사에 소속되지 않았으면 SR 처리자 (엔지니어)
  return "SR 처리자";
};

// 유형별 배지 색상 결정
const getUserTypeBadgeVariant = (typeLabel: string) => {
  switch (typeLabel) {
    case "시스템 관리자":
      return "destructive" as const;
    case "SR 처리자":
      return "default" as const;
    case "SR 요청자":
      return "outline" as const;
    default:
      return "secondary" as const;
  }
};

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAssignRolesDialogOpen, setIsAssignRolesDialogOpen] = useState(false);
  const { toast } = useToast();

  const fetchUser = async () => {
    try {
      const response = await fetch(`/api/users/${params.id}`);
      if (!response.ok) {
        if (response.status === 404) {
          toast({
            title: "오류",
            description: "사용자를 찾을 수 없습니다.",
            variant: "destructive",
          });
          router.push("/users");
          return;
        }
        throw new Error("Failed to fetch user");
      }
      const data = await response.json();
      setUser(data);
    } catch (error) {
      toast({
        title: "오류",
        description: "사용자 정보를 불러오는데 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (params.id) {
      fetchUser();
    }
  }, [params.id]);

  const handleUserUpdated = () => {
    fetchUser();
    setIsEditDialogOpen(false);
  };

  const handleRolesUpdated = () => {
    fetchUser();
    setIsAssignRolesDialogOpen(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">로딩 중...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">사용자를 찾을 수 없습니다.</p>
      </div>
    );
  }

  // 모든 권한을 중복 제거하여 수집
  const allPermissions = new Map<string, Permission["permission"]>();
  user.roles.forEach((userRole) => {
    userRole.role.permissions.forEach((rolePermission) => {
      const key = `${rolePermission.permission.resource}.${rolePermission.permission.action}`;
      if (!allPermissions.has(key)) {
        allPermissions.set(key, rolePermission.permission);
      }
    });
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/users">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{user.name}</h1>
            <p className="text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <PermissionGuard roles={["ADMIN"]}>
            <Button
              variant="outline"
              onClick={() => setIsAssignRolesDialogOpen(true)}
            >
              <Shield className="mr-2 h-4 w-4" />
              역할 관리
            </Button>
          </PermissionGuard>
          <PermissionGuard roles={["ADMIN"]}>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              수정
            </Button>
          </PermissionGuard>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>기본 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">
                  이름
                </h3>
                <p className="text-sm">{user.name}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">
                  이메일
                </h3>
                <p className="text-sm">{user.email}</p>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">
                  사용자 유형
                </h3>
                <Badge variant={getUserTypeBadgeVariant(getUserTypeLabel(user))}>
                  {getUserTypeLabel(user)}
                </Badge>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">
                  상태
                </h3>
                <Badge variant={user.isActive ? "default" : "secondary"}>
                  {user.isActive ? "활성" : "비활성"}
                </Badge>
              </div>
            </div>

            {user.clients.length > 0 && (
              <>
                <Separator />

                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    할당된 고객사
                  </h3>
                  <div className="flex gap-2 flex-wrap">
                    {user.clients.map((uc) => (
                      <Badge key={uc.client.id} variant="outline">
                        {uc.client.name} ({uc.client.code})
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">
                  가입일
                </h3>
                <p className="text-sm">
                  {new Date(user.createdAt).toLocaleString("ko-KR")}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">
                  수정일
                </h3>
                <p className="text-sm">
                  {new Date(user.updatedAt).toLocaleString("ko-KR")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>통계</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">역할</span>
              </div>
              <span className="text-2xl font-bold">{user.roles.length}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">권한</span>
              </div>
              <span className="text-2xl font-bold">
                {allPermissions.size}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>역할 및 권한</CardTitle>
          <CardDescription>이 사용자에게 할당된 역할과 권한입니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              역할
            </h3>
            <div className="flex gap-2 flex-wrap">
              {user.roles.length === 0 ? (
                <Badge variant="outline">역할 없음</Badge>
              ) : (
                user.roles.map((userRole) => (
                  <Badge key={userRole.role.id} variant="secondary">
                    {userRole.role.name}
                  </Badge>
                ))
              )}
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              권한 목록 ({allPermissions.size}개)
            </h3>
            {allPermissions.size === 0 ? (
              <p className="text-sm text-muted-foreground">할당된 권한이 없습니다.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>리소스</TableHead>
                    <TableHead>액션</TableHead>
                    <TableHead>설명</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from(allPermissions.values()).map((permission) => (
                    <TableRow key={permission.id}>
                      <TableCell className="font-medium">
                        <Badge variant="outline">{permission.resource}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge>{permission.action}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {permission.description || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>

      <UserDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        user={user}
        onSaved={handleUserUpdated}
      />

      <AssignRolesDialog
        open={isAssignRolesDialogOpen}
        onOpenChange={setIsAssignRolesDialogOpen}
        user={user}
        onSaved={handleRolesUpdated}
      />
    </div>
  );
}
