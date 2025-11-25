"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Shield, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  const fetchRoles = useCallback(async () => {
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
  }, [toast]);

  useEffect(() => {
    if (open) {
      fetchRoles();
      if (user) {
        setSelectedRoleIds(user.roles.map((ur) => ur.role.id));
      }
      setSearchQuery("");
    }
  }, [open, user, fetchRoles]);

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

        // 시스템 운영팀 역할 + 고객사 할당 충돌 에러 처리
        if (error.assignedClients && error.assignedClients.length > 0) {
          const clientNames = error.assignedClients.map((c: any) => c.name).join(', ');
          toast({
            title: "역할 할당 제한",
            description: (
              <div className="space-y-2">
                <p>{error.error}</p>
                <p className="text-sm">
                  <strong>할당된 고객사:</strong> {clientNames}
                </p>
                <p className="text-sm text-muted-foreground">{error.suggestion}</p>
              </div>
            ),
            variant: "destructive",
            duration: 8000,
          });
        } else {
          throw new Error(error.error || "Failed to assign roles");
        }
        return;
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

  // 검색 필터링
  const filteredRoles = useMemo(() => {
    if (!searchQuery) return roles;
    return roles.filter((role) =>
      role.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [roles, searchQuery]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle className="text-xl flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            역할 할당
          </DialogTitle>
          <DialogDescription>
            <span className="font-semibold text-foreground">{user?.name}</span>님에게 부여할 역할을 선택하세요.
          </DialogDescription>
        </DialogHeader>

        {/* 검색 영역 */}
        <div className="px-6 py-3 bg-slate-50/50 border-b shrink-0">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="역할 검색..."
              className="pl-8 bg-white"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* 역할 리스트 (카드형) */}
        <ScrollArea className="flex-1 p-6 bg-slate-50/30">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredRoles.map((role) => {
                const isSelected = selectedRoleIds.includes(role.id);
                return (
                  <div
                    key={role.id}
                    onClick={() => handleToggleRole(role.id)}
                    className={cn(
                      "cursor-pointer rounded-lg border p-4 transition-all duration-200 hover:shadow-md relative overflow-hidden bg-white",
                      isSelected
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "hover:border-primary/50"
                    )}
                  >
                    {/* 선택 표시 아이콘 */}
                    {isSelected && (
                      <div className="absolute top-0 right-0 bg-primary text-white p-1 rounded-bl-lg shadow-sm">
                        <Check className="w-3 h-3" />
                      </div>
                    )}

                    <div className="flex flex-col gap-1.5">
                      <h4
                        className={cn(
                          "font-semibold flex items-center gap-2 transition-colors",
                          isSelected ? "text-primary" : "text-foreground"
                        )}
                      >
                        {role.name}
                      </h4>
                      {role.description ? (
                        <p className="text-sm text-muted-foreground line-clamp-2 leading-snug">
                          {role.description}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground/50 italic">
                          설명 없음
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
              {filteredRoles.length === 0 && (
                <div className="col-span-full text-center py-12 text-muted-foreground">
                  검색 결과가 없습니다.
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t bg-white shrink-0">
          <div className="flex-1 text-sm text-muted-foreground flex items-center">
            {selectedRoleIds.length}개 역할 선택됨
          </div>
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

