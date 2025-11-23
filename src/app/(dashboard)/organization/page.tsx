"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Building2, Users, ChevronDown, ChevronRight, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ClientDialog } from "@/components/clients/ClientDialog";
import { UserDialog } from "@/components/users/UserDialog";

interface User {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  roles: Array<{
    role: {
      name: string;
    };
  }>;
}

interface Client {
  id: string;
  code: string;
  name: string;
  industry?: string;
  isActive: boolean;
  users: Array<{
    user: User;
  }>;
  _count?: {
    users: number;
    srs: number;
  };
}

export default function OrganizationPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [clientUsers, setClientUsers] = useState<Record<string, User[]>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isClientDialogOpen, setIsClientDialogOpen] = useState(false);
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/clients?pageSize=1000");
      if (!response.ok) throw new Error("Failed to fetch clients");
      const result = await response.json();
      const clientData = Array.isArray(result) ? result : (result.data || []);
      setClients(clientData);
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

  const toggleClient = async (clientId: string) => {
    const newExpanded = new Set(expandedClients);
    if (newExpanded.has(clientId)) {
      newExpanded.delete(clientId);
    } else {
      newExpanded.add(clientId);
      // 데이터가 없으면 fetch
      if (!clientUsers[clientId]) {
        try {
          const response = await fetch(`/api/clients/${clientId}`);
          if (response.ok) {
            const data = await response.json();
            // API returns users as UserClient objects ({ user: User }), we need to extract user objects
            // But wait, the interface for User in this file matches what we want to display?
            // The API returns { users: [{ user: { ... } }] }
            // Let's store the whole structure or transform it.
            // The render loop expects { user: User }.
            // Let's store the array directly from data.users
            setClientUsers((prev) => ({
              ...prev,
              [clientId]: data.users || [],
            }));
          }
        } catch (error) {
          console.error("Failed to fetch client users:", error);
          toast({
             title: "오류",
             description: "사용자 정보를 불러오는데 실패했습니다.",
             variant: "destructive",
          });
        }
      }
    }
    setExpandedClients(newExpanded);
  };

  const handleAddClient = () => {
    setIsClientDialogOpen(true);
  };

  const handleAddUser = (clientId: string) => {
    setSelectedClient(clientId);
    setIsUserDialogOpen(true);
  };

  const handleClientSaved = () => {
    fetchClients();
    setIsClientDialogOpen(false);
  };

  const handleUserSaved = () => {
    fetchClients();
    setIsUserDialogOpen(false);
    setSelectedClient(null);
  };

  const filteredClients = clients.filter((client) =>
    searchQuery
      ? client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        client.code.toLowerCase().includes(searchQuery.toLowerCase())
      : true
  );

  const totalUsers = clients.reduce((sum, client) => sum + (client._count?.users || 0), 0);
  const totalClients = clients.length;
  const activeClients = clients.filter((c) => c.isActive).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-[hsl(var(--sr-primary-dark))]">
            조직 구조
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            고객사 및 소속 사용자를 통합적으로 관리합니다.
          </p>
        </div>
        <Button onClick={handleAddClient} className="sr-btn-template-primary">
          <Plus className="mr-2 h-4 w-4" />
          고객사 추가
        </Button>
      </div>

      {/* 통계 카드 */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="sr-card-template bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-primary/10">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">전체 고객사</p>
              <p className="text-2xl font-bold">{totalClients}</p>
            </div>
          </div>
        </div>

        <div className="sr-card-template bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-green-100">
              <Building2 className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">활성 고객사</p>
              <p className="text-2xl font-bold">{activeClients}</p>
            </div>
          </div>
        </div>

        <div className="sr-card-template bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-blue-100">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">전체 사용자</p>
              <p className="text-2xl font-bold">{totalUsers}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 조직 트리 */}
      <div className="sr-card-template bg-white">
        <div className="px-6 py-5 border-b border-[hsl(var(--sr-border))]">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold text-[hsl(var(--sr-primary-dark))]">
              조직 트리
            </h3>
            <div className="relative w-80">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="고객사 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-2">
          {filteredClients.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="h-16 w-16 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">
                {searchQuery ? "검색 결과가 없습니다." : "등록된 고객사가 없습니다."}
              </p>
            </div>
          ) : (
            filteredClients.map((client) => {
              const isExpanded = expandedClients.has(client.id);
              const userCount = client._count?.users || 0;

              return (
                <div key={client.id} className="border rounded-lg overflow-hidden">
                  {/* 고객사 헤더 */}
                  <div className="flex items-center gap-3 p-4 bg-muted/20 hover:bg-muted/30 transition-colors">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleClient(client.id)}
                      className="h-8 w-8 p-0 shrink-0"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>

                    <Building2 className="h-5 w-5 text-primary shrink-0" />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/clients/${client.id}`}
                          className="font-semibold text-[hsl(var(--sr-primary-dark))] hover:underline truncate"
                        >
                          {client.name}
                        </Link>
                        <Badge variant="outline" className="shrink-0">
                          {client.code}
                        </Badge>
                        {client.industry && (
                          <Badge variant="secondary" className="shrink-0">
                            {client.industry}
                          </Badge>
                        )}
                        <Badge
                          variant={client.isActive ? "default" : "secondary"}
                          className="shrink-0"
                        >
                          {client.isActive ? "활성" : "비활성"}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {userCount}명
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddUser(client.id)}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        사용자 추가
                      </Button>
                    </div>
                  </div>

                  {/* 사용자 목록 */}
                  {isExpanded && (
                    <div className="p-4 bg-background space-y-2">
                      {userCount === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          등록된 사용자가 없습니다.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {(clientUsers[client.id] || []).map((uc: any) => (
                            <Link
                              key={uc.user?.id || Math.random()} 
                              href={uc.user?.id ? `/users/${uc.user.id}` : "#"}
                              className="flex items-center gap-3 p-3 rounded-md border hover:bg-accent transition-colors"
                            >
                              <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {uc.user?.name || "이름 없음"}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {uc.user?.email || "-"}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {uc.user?.roles?.slice(0, 2).map((ur: any) => (
                                  <Badge
                                    key={ur.role.name}
                                    variant="secondary"
                                    className="text-xs"
                                  >
                                    {ur.role.name}
                                  </Badge>
                                ))}
                                {uc.user?.roles?.length > 2 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{uc.user.roles.length - 2}
                                  </Badge>
                                )}
                                <Badge
                                  variant={uc.user?.isActive ? "default" : "secondary"}
                                  className="text-xs"
                                >
                                  {uc.user?.isActive ? "활성" : "비활성"}
                                </Badge>
                              </div>
                            </Link>
                          ))}
                          {!clientUsers[client.id] && userCount > 0 && (
                             <div className="text-center py-4 text-sm text-muted-foreground">
                               사용자 정보 로딩 중...
                             </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <ClientDialog
        open={isClientDialogOpen}
        onOpenChange={setIsClientDialogOpen}
        client={null}
        onSaved={handleClientSaved}
      />

      <UserDialog
        open={isUserDialogOpen}
        onOpenChange={setIsUserDialogOpen}
        user={null}
        onSaved={handleUserSaved}
        defaultClientId={selectedClient || undefined}
      />
    </div>
  );
}
