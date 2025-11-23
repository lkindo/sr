"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Plus, ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
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
import { ClientDialog } from "@/components/clients/ClientDialog";
import { ClientUsersSheet } from "@/components/clients/ClientUsersSheet";
import { useToast } from "@/hooks/use-toast";

interface Client {
  id: string;
  code: string;
  name: string;
  industry?: string;
  contactPerson?: string;
  contactEmail?: string;
  isActive: boolean;
  _count?: {
    users: number;
    srs: number;
  };
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isClientDialogOpen, setIsClientDialogOpen] = useState(false);
  const [isUsersSheetOpen, setIsUsersSheetOpen] = useState(false);
  const [selectedClientForUsers, setSelectedClientForUsers] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [clientUsers, setClientUsers] = useState<Record<string, any[]>>({});
  const { toast } = useToast();

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/clients");
      if (!response.ok) throw new Error("Failed to fetch clients");
      const result = await response.json();
      // 페이지네이션 응답에서 data 추출
      setClients(result.data || result);
    } catch (error) {
      toast({
        title: "오류",
        description: "고객사 목록을 불러오는데 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const handleCreateClient = () => {
    setSelectedClient(null);
    setIsClientDialogOpen(true);
  };

  const handleClientSaved = () => {
    fetchClients();
    setIsClientDialogOpen(false);
  };

  const handleUsersClick = (client: Client, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedClientForUsers({
      id: client.id,
      name: client.name,
    });
    setIsUsersSheetOpen(true);
  };

  const toggleRowExpansion = async (clientId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(clientId)) {
      newExpanded.delete(clientId);
    } else {
      newExpanded.add(clientId);
      // 사용자 데이터가 없으면 가져오기
      if (!clientUsers[clientId]) {
        try {
          const response = await fetch(`/api/clients/${clientId}`);
          if (response.ok) {
            const data = await response.json();
            setClientUsers((prev) => ({
              ...prev,
              [clientId]: data.users || [],
            }));
          }
        } catch (error) {
          console.error("사용자 데이터 로드 실패:", error);
        }
      }
    }
    setExpandedRows(newExpanded);
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
      {/* 메인 컨텐츠 카드 */}
      <div className="sr-card-template bg-white">
        {/* 리스트 헤더 */}
        <div className="px-6 py-5 border-b border-[hsl(var(--sr-border))]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-[hsl(var(--sr-primary-dark))]">고객사 목록</h3>
            <Button onClick={handleCreateClient} className="sr-btn-template-primary">
              <Plus className="mr-2 h-4 w-4" />
              등록
            </Button>
          </div>
        </div>

        {/* Total Count - 테이블 바로 위 */}
        <div className="px-6 py-2 border-b border-[hsl(var(--sr-border))] flex justify-end">
          <div className="text-sm text-muted-foreground">
            Total <span className="font-semibold text-[hsl(var(--sr-primary-dark))]">{clients.length}</span> items
          </div>
        </div>

        {/* 테이블 영역 */}
        <div className="overflow-x-auto">
          <Table className="sr-table-template">
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>코드</TableHead>
                <TableHead>고객사명</TableHead>
                <TableHead>산업</TableHead>
                <TableHead>담당자</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>사용자</TableHead>
                <TableHead>SR</TableHead>
                <TableHead>상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    등록된 고객사가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                clients.map((client) => {
                  const isExpanded = expandedRows.has(client.id);
                  const users = clientUsers[client.id] || [];
                  return (
                    <React.Fragment key={client.id}>
                      <TableRow className="hover:bg-muted/50">
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleRowExpansion(client.id)}
                            className="h-8 w-8 p-0"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell className="font-medium text-center">{client.code}</TableCell>
                        <TableCell>
                          <Link
                            href={`/clients/${client.id}`}
                            className="text-primary hover:underline font-medium"
                          >
                            {client.name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-center">{client.industry || "-"}</TableCell>
                        <TableCell className="text-center">{client.contactPerson || "-"}</TableCell>
                        <TableCell>{client.contactEmail || "-"}</TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="secondary"
                            className="cursor-pointer hover:bg-secondary/80 transition-colors"
                            onClick={(e) => handleUsersClick(client, e)}
                          >
                            {client._count?.users || 0}명
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">
                            {client._count?.srs || 0}건
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={client.isActive ? "default" : "secondary"}
                          >
                            {client.isActive ? "활성" : "비활성"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${client.id}-expanded`} className="bg-muted/20">
                          <TableCell colSpan={9} className="p-0">
                            <div className="p-4 pl-16">
                              <h4 className="text-sm font-semibold mb-3 text-[hsl(var(--sr-primary-dark))]">
                                소속 사용자 ({users.length}명)
                              </h4>
                              {users.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-2">
                                  등록된 사용자가 없습니다.
                                </p>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {users.map((uc: any) => (
                                    <Link
                                      key={uc.user.id}
                                      href={`/users/${uc.user.id}`}
                                      className="flex items-center gap-2 p-3 rounded-md border bg-background hover:bg-accent transition-colors"
                                    >
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">
                                          {uc.user.name}
                                        </p>
                                        <p className="text-xs text-muted-foreground truncate">
                                          {uc.user.email}
                                        </p>
                                      </div>
                                    </Link>
                                  ))}
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <ClientDialog
        open={isClientDialogOpen}
        onOpenChange={setIsClientDialogOpen}
        client={selectedClient}
        onSaved={handleClientSaved}
      />

      <ClientUsersSheet
        open={isUsersSheetOpen}
        onOpenChange={setIsUsersSheetOpen}
        clientId={selectedClientForUsers?.id || null}
        clientName={selectedClientForUsers?.name || ""}
      />
    </div>
  );
}
