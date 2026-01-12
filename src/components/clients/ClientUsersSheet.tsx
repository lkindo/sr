"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Users, Mail, Calendar, Trash2 } from "lucide-react";
import { DeleteUserDialog } from "@/components/users/DeleteUserDialog";

interface User {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  createdAt: string;
  roles: Array<{
    role: {
      id: string;
      name: string;
    };
  }>;
}

interface ClientUsersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string | null;
  clientName: string;
}

export function ClientUsersSheet({
  open,
  onOpenChange,
  clientId,
  clientName,
}: ClientUsersSheetProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (open && clientId) {
      fetchUsers();
    }
  }, [open, clientId]);

  const fetchUsers = async () => {
    if (!clientId) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/clients/${clientId}`);
      if (!response.ok) throw new Error("Failed to fetch client users");
      const data = await response.json();

      // UserClient 구조에서 user 정보 추출
      const usersList = data.users?.map((uc: { user: User }) => uc.user) || [];
      setUsers(usersList);
    } catch {
      toast({
        title: "오류",
        description: "사용자 목록을 불러오는데 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      toast({
        title: "삭제 완료",
        description: "사용자가 삭제되었습니다.",
        variant: "default",
      });
      // Refresh list
      fetchUsers();
    } catch {
      toast({
        title: "오류",
        description: "사용자 삭제에 실패했습니다.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {clientName} - 소속 사용자
            </SheetTitle>
            <SheetDescription>
              이 고객사에 소속된 사용자 목록입니다.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-muted-foreground">로딩 중...</p>
              </div>
            ) : users.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Users className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">등록된 사용자가 없습니다.</p>
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    총 <span className="font-semibold text-foreground">{users.length}</span>명
                  </p>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/clients/${clientId}`}>
                      고객사 상세보기
                    </Link>
                  </Button>
                </div>

                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>이름</TableHead>
                        <TableHead>이메일</TableHead>
                        <TableHead>역할</TableHead>
                        <TableHead>상태</TableHead>
                        <TableHead className="text-right">작업</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">
                            <Link
                              href={`/users/${user.id}`}
                              className="text-primary hover:underline"
                            >
                              {user.name}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Mail className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm">{user.email}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap">
                              {(user.roles || []).length === 0 ? (
                                <Badge variant="outline" className="text-xs">
                                  역할 없음
                                </Badge>
                              ) : (
                                (user.roles || []).map((ur) => (
                                  <Badge
                                    key={ur.role.id}
                                    variant="secondary"
                                    className="text-xs"
                                  >
                                    {ur.role.name}
                                  </Badge>
                                ))
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={user.isActive ? "default" : "secondary"}
                              className="text-xs"
                            >
                              {user.isActive ? "활성" : "비활성"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/users/${user.id}`}>상세보기</Link>
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="ml-2"
                              onClick={() => {
                                setSelectedUser(user);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="mt-4 p-3 bg-muted/50 rounded-md">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    사용자 관리는 사용자 페이지에서 할 수 있습니다.
                  </p>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete User Dialog */}
      <DeleteUserDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        user={selectedUser}
        onDelete={handleDeleteUser}
      />
    </>
  );
}
