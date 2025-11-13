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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface Client {
  id: string;
  name: string;
  code: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  clients?: Array<{
    client: Client;
  }>;
}

interface UserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
  onSaved: () => void;
}

export function UserDialog({
  open,
  onOpenChange,
  user,
  onSaved,
}: UserDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [userType, setUserType] = useState<"ENGINEER" | "CLIENT">("ENGINEER");
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingClients, setLoadingClients] = useState(true);
  const { toast } = useToast();

  const isEditMode = !!user;

  const fetchClients = useCallback(async () => {
    try {
      const response = await fetch("/api/clients");
      if (!response.ok) throw new Error("Failed to fetch clients");
      const data = await response.json();
      setClients(data);
    } catch (error) {
      toast({
        title: "오류",
        description: "고객사 목록을 불러오는데 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setLoadingClients(false);
    }
  }, [toast]);

  useEffect(() => {
    if (open) {
      fetchClients();
    }
  }, [open, fetchClients]);

  const toggleClient = (clientId: string) => {
    setSelectedClientIds((prev) =>
      prev.includes(clientId)
        ? prev.filter((id) => id !== clientId)
        : [...prev, clientId]
    );
  };

  useEffect(() => {
    if (open) {
      if (user) {
        setName(user.name);
        setEmail(user.email);
        setIsActive(user.isActive);
        setPassword("");
        setConfirmPassword("");

        // 사용자 유형 및 고객사 설정
        const userClients = user.clients || [];
        setUserType(userClients.length > 0 ? "CLIENT" : "ENGINEER");
        setSelectedClientIds(userClients.map((uc) => uc.client.id));
      } else {
        setName("");
        setEmail("");
        setPassword("");
        setConfirmPassword("");
        setIsActive(true);
        setUserType("ENGINEER");
        setSelectedClientIds([]);
      }
    }
  }, [open, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (name.length < 2) {
      toast({
        title: "오류",
        description: "이름은 최소 2자 이상이어야 합니다.",
        variant: "destructive",
      });
      return;
    }

    if (!isEditMode && password.length < 8) {
      toast({
        title: "오류",
        description: "비밀번호는 최소 8자 이상이어야 합니다.",
        variant: "destructive",
      });
      return;
    }

    if (isEditMode && password && password.length < 8) {
      toast({
        title: "오류",
        description: "비밀번호는 최소 8자 이상이어야 합니다.",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "오류",
        description: "비밀번호가 일치하지 않습니다.",
        variant: "destructive",
      });
      return;
    }

    if (userType === "CLIENT" && selectedClientIds.length === 0) {
      toast({
        title: "오류",
        description: "SR 요청자는 최소 1개 이상의 고객사를 선택해야 합니다.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const payload: any = {
        name,
        email,
        isActive,
        userType,
        clientIds: userType === "CLIENT" ? selectedClientIds : [],
      };

      if (password) {
        payload.password = password;
      }

      const url = isEditMode ? `/api/users/${user.id}` : "/api/users";
      const method = isEditMode ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save user");
      }

      toast({
        title: "성공",
        description: `사용자가 ${isEditMode ? "수정" : "생성"}되었습니다.`,
      });

      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "오류",
        description:
          error instanceof Error ? error.message : "사용자 저장에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? "사용자 수정" : "새 사용자 추가"}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "사용자 정보를 수정합니다."
              : "새 사용자를 생성합니다. 모든 필드는 필수입니다."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">이름 *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="사용자 이름"
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">이메일 *</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="userType">사용자 유형 *</Label>
              <Select
                value={userType}
                onValueChange={(value: "ENGINEER" | "CLIENT") => {
                  setUserType(value);
                  if (value === "ENGINEER") {
                    setSelectedClientIds([]);
                  }
                }}
                disabled={loading}
              >
                <SelectTrigger id="userType">
                  <SelectValue placeholder="사용자 유형 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ENGINEER">SR 처리자</SelectItem>
                  <SelectItem value="CLIENT">SR 요청자</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {userType === "CLIENT" && (
              <div className="space-y-2">
                <Label>할당 고객사 *</Label>
                {loadingClients ? (
                  <p className="text-sm text-muted-foreground">
                    고객사 목록 로딩 중...
                  </p>
                ) : (
                  <div className="border rounded-md p-4 space-y-2 max-h-60 overflow-y-auto">
                    {clients.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        등록된 고객사가 없습니다.
                      </p>
                    ) : (
                      clients.map((client) => (
                        <div
                          key={client.id}
                          className="flex items-center space-x-2"
                        >
                          <Checkbox
                            id={`client-${client.id}`}
                            checked={selectedClientIds.includes(client.id)}
                            onCheckedChange={() => toggleClient(client.id)}
                            disabled={loading}
                          />
                          <Label
                            htmlFor={`client-${client.id}`}
                            className="cursor-pointer font-normal"
                          >
                            {client.name} ({client.code})
                          </Label>
                        </div>
                      ))
                    )}
                  </div>
                )}
                {selectedClientIds.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {selectedClientIds.length}개 고객사 선택됨
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">
                {isEditMode ? "비밀번호 (변경 시에만 입력)" : "비밀번호 *"}
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="최소 8자 이상"
                required={!isEditMode}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">
                {isEditMode ? "비밀번호 확인" : "비밀번호 확인 *"}
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="비밀번호를 다시 입력하세요"
                required={!isEditMode || !!password}
                disabled={loading}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="isActive"
                checked={isActive}
                onCheckedChange={(checked) => setIsActive(checked === true)}
                disabled={loading}
              />
              <Label htmlFor="isActive" className="cursor-pointer">
                활성 상태
              </Label>
            </div>
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
