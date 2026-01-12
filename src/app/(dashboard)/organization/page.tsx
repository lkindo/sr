"use client";

import { useState, useEffect } from "react";
import { Building2, Users, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/use-debounce";
import { ClientDialog } from "@/components/clients/ClientDialog";
import { UserDialog } from "@/components/users/UserDialog";
import { OrganizationTree, type Client, type User } from "@/components/organization/OrganizationTree";
import { UserReassignDialog } from "@/components/organization/UserReassignDialog";
import type { DragEndEvent, DragStartEvent, DragOverEvent } from "@dnd-kit/core";

export default function OrganizationPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [clientUsers, setClientUsers] = useState<Record<string, User[]>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isClientDialogOpen, setIsClientDialogOpen] = useState(false);
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);

  // 드래그 앤 드롭 관련 상태
  const [isReassignDialogOpen, setIsReassignDialogOpen] = useState(false);
  const [isReassigning, setIsReassigning] = useState(false);
  const [reassignData, setReassignData] = useState<{
    userId: string;
    userName: string;
    sourceClientId: string;
    sourceClientName: string;
    targetClientId: string;
    targetClientName: string;
  } | null>(null);
  const [ongoingSRs, setOngoingSRs] = useState<any[]>([]);
  const [showWarning, setShowWarning] = useState(false);

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
    } catch {
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

  // 고객사 상태 변경 핸들러
  const handleToggleClientStatus = async (clientId: string) => {
    try {
      const client = clients.find(c => c.id === clientId);
      if (!client) return;

      const response = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !client.isActive }),
      });

      if (!response.ok) throw new Error('Failed to update client status');

      await fetchClients();
      toast({
        title: "성공",
        description: `${client.name}이(가) ${client.isActive ? "비활성화" : "활성화"}되었습니다.`,
      });
    } catch {
      toast({
        title: "오류",
        description: "상태 변경 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    }
  };

  // 사용자 상태 변경 핸들러
  const handleToggleUserStatus = async (userId: string) => {
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: undefined }), // Toggle will be handled by API
      });

      if (!response.ok) throw new Error('Failed to update user status');

      // Refresh all data
      await fetchClients();
      // Reload users for expanded clients
      for (const clientId of Array.from(expandedClients)) {
        const response = await fetch(`/api/clients/${clientId}`);
        if (response.ok) {
          const data = await response.json();
          setClientUsers((prev) => ({
            ...prev,
            [clientId]: data.users || [],
          }));
        }
      }

      toast({
        title: "성공",
        description: "사용자 상태가 변경되었습니다.",
      });
    } catch {
      toast({
        title: "오류",
        description: "상태 변경 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    }
  };

  // 드래그 앤 드롭 핸들러
  const handleDragStart = (_event: DragStartEvent) => {
    // 드래그 시작 시 추가 처리 (필요시)
  };

  const handleDragOver = (_event: DragOverEvent) => {
    // 드래그 오버 시 추가 처리 (필요시)
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    // 드롭 영역이 없거나 유효하지 않으면 무시
    if (!over || !active) return;

    const userId = active.data.current?.userId as string;
    const sourceClientId = active.data.current?.sourceClientId as string;
    const user = active.data.current?.user;
    const targetClientId = over.data.current?.clientId as string;

    // 드래그한 항목이 사용자가 아니면 무시
    if (!userId || !user) return;

    // 같은 고객사로 드롭하면 무시
    if (sourceClientId === targetClientId) {
      toast({
        title: "알림",
        description: "같은 고객사로는 이동할 수 없습니다.",
        variant: "default",
      });
      return;
    }

    // 고객사 정보 찾기
    const sourceClient = clients.find(c => c.id === sourceClientId);
    const targetClient = clients.find(c => c.id === targetClientId);

    if (!sourceClient || !targetClient) {
      toast({
        title: "오류",
        description: "고객사 정보를 찾을 수 없습니다.",
        variant: "destructive",
      });
      return;
    }

    // 확인 모달 열기
    setReassignData({
      userId,
      userName: user.name,
      sourceClientId,
      sourceClientName: sourceClient.name,
      targetClientId,
      targetClientName: targetClient.name,
    });
    // 상태 초기화
    setOngoingSRs([]);
    setShowWarning(false);
    setIsReassignDialogOpen(true);
  };

  // 소속 변경 확인
  const handleConfirmReassign = async (force: boolean = false) => {
    if (!reassignData) return;

    setIsReassigning(true);
    try {
      const response = await fetch(`/api/users/${reassignData.userId}/client`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: reassignData.targetClientId,
          force
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to reassign user');
      }

      // 경고가 있고 강제 이동이 아니면 경고 표시
      if (result.warning && !force) {
        setOngoingSRs(result.data.ongoingSRs || []);
        setShowWarning(true);
        setIsReassigning(false);
        return;
      }

      // 성공 처리
      // 데이터를 먼저 모두 가져온 후 상태를 한 번에 업데이트 (깜빡임 방지)
      const [clientsResponse, ...userResponses] = await Promise.all([
        // 1. 고객사 목록 가져오기
        fetch("/api/clients?pageSize=1000").then(res => res.ok ? res.json() : null),
        // 2. 양쪽 고객사의 사용자 목록 가져오기
        ...[reassignData.sourceClientId, reassignData.targetClientId]
          .filter(clientId => expandedClients.has(clientId))
          .map(clientId =>
            fetch(`/api/clients/${clientId}`)
              .then(res => res.ok ? res.json().then(data => ({ clientId, users: data.users || [] })) : null)
              .catch(() => null)
          )
      ]);

      // 상태를 한 번에 업데이트
      if (clientsResponse) {
        const clientData = Array.isArray(clientsResponse) ? clientsResponse : (clientsResponse.data || []);
        setClients(clientData);
      }

      // 사용자 목록 상태 한 번에 업데이트
      const newClientUsers: Record<string, User[]> = {};
      userResponses.forEach((response: any) => {
        if (response && response.clientId) {
          newClientUsers[response.clientId] = response.users;
        }
      });

      if (Object.keys(newClientUsers).length > 0) {
        setClientUsers(prev => ({
          ...prev,
          ...newClientUsers,
        }));
      }

      toast({
        title: "성공",
        description: `${reassignData.userName}이(가) ${reassignData.targetClientName}(으)로 이동되었습니다.${result.data?.ongoingSRsHandled > 0 ? ` (진행 중인 SR ${result.data.ongoingSRsHandled}건 유지됨)` : ''}`,
      });

      // 다이얼로그 닫기 및 상태 초기화
      setIsReassignDialogOpen(false);
      setReassignData(null);
      setOngoingSRs([]);
      setShowWarning(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "소속 변경 중 오류가 발생했습니다.";
      toast({
        title: "오류",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsReassigning(false);
    }
  };

  // Debounce search query
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // 검색어가 있을 때 일치하는 고객사 또는 해당 고객사의 사용자가 일치하는 경우 자동 펼침
  useEffect(() => {
    if (debouncedSearchQuery) {
      const matchingClientIds = new Set<string>();

      clients.forEach((client) => {
        // 고객사 이름이나 코드가 일치하면 펼침
        const clientMatches =
          client.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
          client.code.toLowerCase().includes(debouncedSearchQuery.toLowerCase());

        if (clientMatches) {
          matchingClientIds.add(client.id);
        }

        // 사용자 이름이나 이메일이 일치하면 해당 고객사 펼침
        const users = clientUsers[client.id] || [];
        const userMatches = users.some((uc: any) => {
          const user = uc.user || uc;
          return (
            user.name?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
            user.email?.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
          );
        });

        if (userMatches) {
          matchingClientIds.add(client.id);
        }
      });

      setExpandedClients(matchingClientIds);
    }
  }, [debouncedSearchQuery, clients, clientUsers]);

  const filteredClients = clients.filter((client) =>
    debouncedSearchQuery
      ? client.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
      client.code.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
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

        <div className="px-6 py-5">
          <OrganizationTree
            clients={filteredClients}
            expandedClients={expandedClients}
            clientUsers={clientUsers}
            onToggleClient={toggleClient}
            onAddUser={handleAddUser}
            onToggleClientStatus={handleToggleClientStatus}
            onToggleUserStatus={handleToggleUserStatus}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            searchQuery={debouncedSearchQuery}
          />
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

      {reassignData && (
        <UserReassignDialog
          open={isReassignDialogOpen}
          onOpenChange={(open) => {
            if (!isReassigning) {
              setIsReassignDialogOpen(open);
              if (!open) {
                setReassignData(null);
                setOngoingSRs([]);
                setShowWarning(false);
              }
            }
          }}
          userName={reassignData.userName}
          sourceClientName={reassignData.sourceClientName}
          targetClientName={reassignData.targetClientName}
          onConfirm={handleConfirmReassign}
          isLoading={isReassigning}
          ongoingSRs={ongoingSRs}
          showWarning={showWarning}
        />
      )}
    </div>
  );
}
