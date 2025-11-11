"use client";

import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { RoleDialog } from "@/components/roles/RoleDialog";
import { PermissionDialog } from "@/components/roles/PermissionDialog";
import { DeleteRoleDialog } from "@/components/roles/DeleteRoleDialog";
import { useToast } from "@/hooks/use-toast";

interface Permission {
  id: string;
  resource: string;
  action: string;
  description?: string;
}

interface RolePermission {
  id: string;
  permission: Permission;
}

interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: RolePermission[];
  _count?: {
    users: number;
  };
}

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [isPermissionDialogOpen, setIsPermissionDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const { toast } = useToast();

  const fetchRoles = async () => {
    try {
      const response = await fetch("/api/roles");
      if (!response.ok) throw new Error("Failed to fetch roles");
      const data = await response.json();
      setRoles(data);
    } catch (error) {
      toast({
        title: "오류",
        description: "역할 목록을 불러오는데 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  const handleCreateRole = () => {
    setSelectedRole(null);
    setIsRoleDialogOpen(true);
  };

  const handleEditRole = (role: Role) => {
    setSelectedRole(role);
    setIsRoleDialogOpen(true);
  };

  const handleManagePermissions = (role: Role) => {
    setSelectedRole(role);
    setIsPermissionDialogOpen(true);
  };

  const handleDeleteRole = (role: Role) => {
    setSelectedRole(role);
    setIsDeleteDialogOpen(true);
  };

  const handleRoleSaved = () => {
    fetchRoles();
    setIsRoleDialogOpen(false);
  };

  const handlePermissionsSaved = () => {
    fetchRoles();
    setIsPermissionDialogOpen(false);
  };

  const handleRoleDeleted = () => {
    fetchRoles();
    setIsDeleteDialogOpen(false);
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
          <h1 className="text-3xl font-bold tracking-tight">역할 관리</h1>
          <p className="text-muted-foreground">
            시스템 역할 및 권한을 관리합니다.
          </p>
        </div>
        <Button onClick={handleCreateRole}>
          <Plus className="mr-2 h-4 w-4" />
          등록
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>역할 목록</CardTitle>
          <CardDescription>
            {roles.length}개의 역할이 등록되어 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>역할 이름</TableHead>
                <TableHead>설명</TableHead>
                <TableHead>권한 수</TableHead>
                <TableHead>사용자 수</TableHead>
                <TableHead className="text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    등록된 역할이 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                roles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell className="font-medium">{role.name}</TableCell>
                    <TableCell>{role.description || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {role.permissions.length}개
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {role._count?.users || 0}명
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditRole(role)}
                      >
                        수정
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleManagePermissions(role)}
                      >
                        권한 관리
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteRole(role)}
                        disabled={role._count && role._count.users > 0}
                      >
                        삭제
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <RoleDialog
        open={isRoleDialogOpen}
        onOpenChange={setIsRoleDialogOpen}
        role={selectedRole}
        onSaved={handleRoleSaved}
      />

      <PermissionDialog
        open={isPermissionDialogOpen}
        onOpenChange={setIsPermissionDialogOpen}
        role={selectedRole}
        onSaved={handlePermissionsSaved}
      />

      <DeleteRoleDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        role={selectedRole}
        onDeleted={handleRoleDeleted}
      />
    </div>
  );
}
