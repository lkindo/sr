'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';

import { ClientDialog } from '@/components/clients/ClientDialog';
import { ClientMobileList } from '@/components/clients/ClientMobileList';
import { ClientTable } from '@/components/clients/ClientTable';
import { ClientUsersSheet } from '@/components/clients/ClientUsersSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

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

interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
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

  // Pagination & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [industryFilter, setIndustryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
  });

  const { toast } = useToast();

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', pagination.page.toString());
      params.append('pageSize', pagination.pageSize.toString());
      if (searchQuery) params.append('search', searchQuery);
      if (industryFilter !== 'all') params.append('industry', industryFilter);
      if (statusFilter !== 'all') params.append('isActive', statusFilter);

      const response = await fetch(`/api/clients?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch clients');
      const result = await response.json();

      setClients(result.data);
      setPagination((prev) => ({
        ...prev,
        total: result.meta.total,
        totalPages: result.meta.totalPages,
      }));
    } catch {
      toast({
        title: '오류',
        description: '고객사 목록을 불러오는데 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, searchQuery, industryFilter, statusFilter, toast]);

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
        } catch {
          // 사용자 데이터 로드 실패 시 무시
        }
      }
    }
    setExpandedRows(newExpanded);
  };

  const handlePageChange = (newPage: number) => {
    setPagination((prev) => ({ ...prev, page: newPage }));
  };

  return (
    <div className="space-y-6">
      {/* 메인 컨텐츠 카드 */}
      <div className="sr-card-template bg-white">
        {/* 리스트 헤더 */}
        <div className="px-6 py-5 border-b border-[hsl(var(--sr-border))]">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-4">
            <h3 className="text-xl font-semibold text-[hsl(var(--sr-primary-dark))]">
              고객사 목록
            </h3>
            <Button onClick={handleCreateClient} className="sr-btn-template-primary">
              <Plus className="mr-2 h-4 w-4" />
              등록
            </Button>
          </div>

          {/* 검색 및 필터 영역 */}
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="고객사명 또는 코드로 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setPagination((prev) => ({ ...prev, page: 1 })); // 검색 시 1페이지로 리셋
                  }
                }}
                className="pl-10 sr-input-template"
              />
            </div>

            <div className="flex gap-2 flex-wrap md:flex-nowrap">
              <Select
                value={industryFilter}
                onValueChange={(val) => {
                  setIndustryFilter(val);
                  setPagination((prev) => ({ ...prev, page: 1 }));
                }}
              >
                <SelectTrigger className="w-[150px] sr-dropdown-template">
                  <SelectValue placeholder="산업군 전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">산업군 전체</SelectItem>
                  <SelectItem value="IT">IT</SelectItem>
                  <SelectItem value="MANUFACTURING">제조</SelectItem>
                  <SelectItem value="FINANCE">금융</SelectItem>
                  <SelectItem value="SERVICE">서비스</SelectItem>
                  <SelectItem value="PUBLIC">공공</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={statusFilter}
                onValueChange={(val) => {
                  setStatusFilter(val);
                  setPagination((prev) => ({ ...prev, page: 1 }));
                }}
              >
                <SelectTrigger className="w-[150px] sr-dropdown-template">
                  <SelectValue placeholder="상태 전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">상태 전체</SelectItem>
                  <SelectItem value="true">활성</SelectItem>
                  <SelectItem value="false">비활성</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Total Count - 테이블 바로 위 */}
        <div className="px-6 py-2 border-b border-[hsl(var(--sr-border))] flex justify-end">
          <div className="text-sm text-muted-foreground">
            Total{' '}
            <span className="font-semibold text-[hsl(var(--sr-primary-dark))]">
              {pagination.total}
            </span>{' '}
            items
          </div>
        </div>

        {/* Desktop View (Table) */}
        <ClientTable
          clients={clients}
          loading={loading}
          expandedRows={expandedRows}
          clientUsers={clientUsers}
          onToggleRowExpansion={toggleRowExpansion}
          onUsersClick={handleUsersClick}
          onCreateClient={handleCreateClient}
        />

        {/* Mobile View (Card List) */}
        <ClientMobileList
          clients={clients}
          loading={loading}
          expandedRows={expandedRows}
          clientUsers={clientUsers}
          onToggleRowExpansion={toggleRowExpansion}
          onUsersClick={handleUsersClick}
          onCreateClient={handleCreateClient}
        />

        {/* Pagination Controls */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-center py-4 border-t border-[hsl(var(--sr-border))]">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page === 1}
              >
                이전
              </Button>
              <span className="text-sm text-muted-foreground">
                {pagination.page} / {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page === pagination.totalPages}
              >
                다음
              </Button>
            </div>
          </div>
        )}
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
        clientName={selectedClientForUsers?.name || ''}
      />
    </div>
  );
}
