"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
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
import { Loader2 } from "lucide-react";

interface Role {
  id: string;
  name: string;
  description: string | null;
}

interface User {
  id: string;
  name: string;
  email: string;
  roles: Array<{
    role: {
      id: string;
      name: string;
    };
  }>;
}

interface AssignRolesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
  onSaved: () => void;
}

export function AssignRolesDialog({
  open,
  onOpenChange,
  user,
  onSaved,
}: AssignRolesDialogProps) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchRoles();
      if (user) {
        setSelectedRoleIds(user.roles.map((ur) => ur.role.id));
      }
    }
  }, [open, user]);

  const fetchRoles = async () => {
    setLoading(true);
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

  const handleToggleRole = (roleId: string) => {
    setSelectedRoleIds((prev) =>
      prev.includes(roleId)
        ? prev.filter((id) => id !== roleId)
        : [...prev, roleId]
    );
  };

  const handleSubmit = async () => {
    if (!user) return;

    setSubmitting(true);
    try {
      const response = await fetch(`/api/users/${user.id}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleIds: selectedRoleIds }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to assign roles");
      }

      toast({
        title: "성공",
        description: "역할이 성공적으로 할당되었습니다.",
      });

      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "오류",
        description:
          error instanceof Error ? error.message : "역할 할당에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>역할 할당</DialogTitle>
          <DialogDescription>
            {user?.name} ({user?.email})에게 역할을 할당합니다.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {roles.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                사용 가능한 역할이 없습니다.
              </p>
            ) : (
              roles.map((role) => (
                <div
                  key={role.id}
                  className="flex items-start space-x-3 space-y-0"
                >
                  <Checkbox
                    id={`role-${role.id}`}
                    checked={selectedRoleIds.includes(role.id)}
                    onCheckedChange={() => handleToggleRole(role.id)}
                  />
                  <div className="flex-1">
                    <Label
                      htmlFor={`role-${role.id}`}
                      className="text-sm font-medium leading-none cursor-pointer"
                    >
                      {role.name}
                    </Label>
                    {role.description && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {role.description}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || loading}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

