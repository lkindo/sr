"use client";

import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
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
  const { toast } = useToast();

  const fetchClients = async () => {
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
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const handleCreateClient = () => {
    setSelectedClient(null);
    setIsClientDialogOpen(true);
  };

  const handleClientSaved = () => {
    fetchClients();
    setIsClientDialogOpen(false);
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
          <h1 className="text-3xl font-bold tracking-tight">고객사 관리</h1>
          <p className="text-muted-foreground">
            고객사 정보를 관리합니다.
          </p>
        </div>
        <Button onClick={handleCreateClient}>
          <Plus className="mr-2 h-4 w-4" />
          새 고객사 추가
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>고객사 목록</CardTitle>
          <CardDescription>
            {clients.length}개의 고객사가 등록되어 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
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
                  <TableCell colSpan={8} className="text-center py-8">
                    등록된 고객사가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                clients.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell className="font-medium">{client.code}</TableCell>
                    <TableCell>
                      <Link
                        href={`/clients/${client.id}`}
                        className="hover:underline text-primary font-medium"
                      >
                        {client.name}
                      </Link>
                    </TableCell>
                    <TableCell>{client.industry || "-"}</TableCell>
                    <TableCell>{client.contactPerson || "-"}</TableCell>
                    <TableCell>{client.contactEmail || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {client._count?.users || 0}명
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {client._count?.srs || 0}건
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={client.isActive ? "default" : "secondary"}
                      >
                        {client.isActive ? "활성" : "비활성"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ClientDialog
        open={isClientDialogOpen}
        onOpenChange={setIsClientDialogOpen}
        client={selectedClient}
        onSaved={handleClientSaved}
      />
    </div>
  );
}
