"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { getAllPermissionsAction } from "@/actions/permission.actions";
import { updateRolePermissionsAction } from "@/actions/role.actions";

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
  permissions: RolePermission[];
}

interface PermissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role | null;
  onSaved: () => void;
}

export function PermissionDialog({
  open,
  onOpenChange,
  role,
  onSaved,
}: PermissionDialogProps) {
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();


  const fetchPermissions = useCallback(async () => {
    try {
      const result = await getAllPermissionsAction();
      if (result.success) {
        setAllPermissions(result.data as Permission[]);
      } else {
        throw new Error(result.error || "권한 목록을 불러오는데 실패했습니다.");
      }
    } catch (error) {
      toast({
        title: "오류",
        description: "권한 목록을 불러오는데 실패했습니다.",
        variant: "destructive",
      });
    }
  }, [toast]);

  useEffect(() => {
    if (open) {
      fetchPermissions();
    }
  }, [open, fetchPermissions]);

  useEffect(() => {
    if (role) {
      setSelectedPermissions(
        role.permissions.map((rp) => rp.permission.id)
      );
    } else {
      setSelectedPermissions([]);
    }
  }, [role]);

  const handleTogglePermission = (permissionId: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(permissionId)
        ? prev.filter((id) => id !== permissionId)
        : [...prev, permissionId]
    );
  };

    const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!role) return;

    setLoading(true);

    try {
      const result = await updateRolePermissionsAction(role.id, selectedPermissions);

      if (!result.success) {
        throw new Error(result.error || "권한 업데이트에 실패했습니다.");
      }

      toast({
        title: "성공",
        description: "권한이 업데이트되었습니다.",
      });

      onSaved();
    } catch (error) {
      toast({
        title: "오류",
        description:
          error instanceof Error
            ? error.message
            : "권한 업데이트에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Group permissions by resource
  const groupedPermissions = allPermissions.reduce((acc, permission) => {
    if (!acc[permission.resource]) {
      acc[permission.resource] = [];
    }
    acc[permission.resource].push(permission);
    return acc;
  }, {} as Record<string, Permission[]>);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>권한 관리 - {role?.name}</DialogTitle>
          <DialogDescription>
            역할에 할당할 권한을 선택하세요.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-6 py-4">
            {Object.entries(groupedPermissions).map(([resource, permissions]) => (
              <div key={resource} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{resource}</Badge>
                  <span className="text-sm text-muted-foreground">
                    {permissions.length}개 권한
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 pl-4">
                  {permissions.map((permission) => (
                    <div
                      key={permission.id}
                      className="flex items-start space-x-2"
                    >
                      <Checkbox
                        id={permission.id}
                        checked={selectedPermissions.includes(permission.id)}
                        onCheckedChange={() =>
                          handleTogglePermission(permission.id)
                        }
                        disabled={loading}
                      />
                      <div className="grid gap-1.5 leading-none">
                        <Label
                          htmlFor={permission.id}
                          className="text-sm font-normal cursor-pointer"
                        >
                          {permission.action}
                        </Label>
                        {permission.description && (
                          <p className="text-xs text-muted-foreground">
                            {permission.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              취소
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
