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
  currentPage: number;
  pageSize: number;
  totalItems: number;
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
    currentPage: 1,
    pageSize: 10,
    totalItems: 0,
    totalPages: 0,
  });

  const { toast } = useToast();

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', pagination.currentPage.toString());
      params.append('pageSize', pagination.pageSize.toString());
      if (searchQuery) params.append('search', searchQuery);
      if (industryFilter !== 'all') params.append('industry', industryFilter);
      if (statusFilter !== 'all') params.append('isActive', statusFilter);

      const response = await fetch(`/api/clients?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch clients');
      const result = await response.json();

      if (!result || !result.data || !result.meta) {
        throw new Error('Invalid response format');
      }

      setClients(result.data);
      setPagination((prev) => ({
        ...prev,
        totalItems: result.meta.totalItems,
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
  }, [
    pagination.currentPage,
    pagination.pageSize,
    searchQuery,
    industryFilter,
    statusFilter,
    toast,
  ]);

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
    setPagination((prev) => ({ ...prev, currentPage: newPage }));
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

          {/* 검색 및 필터 영역 - 데스크톱/모바일 최적화 */}
          <div className="flex flex-col gap-2 mt-2">
            {/* Industry Tabs */}
            <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar -mx-2 px-2 md:mx-0 md:px-0">
              {[
                { label: '전체', value: 'all' },
                { label: 'IT', value: 'IT' },
                { label: '제조', value: 'MANUFACTURING' },
                { label: '금융', value: 'FINANCE' },
                { label: '서비스', value: 'SERVICE' },
                { label: '공공', value: 'PUBLIC' },
              ].map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => {
                    setIndustryFilter(tab.value);
                    setPagination((prev) => ({ ...prev, currentPage: 1 }));
                  }}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap transition-all border ${
                    industryFilter === tab.value
                      ? 'bg-[hsl(var(--sr-primary-dark))] text-white border-[hsl(var(--sr-primary-dark))]'
                      : 'bg-white text-muted-foreground border-border hover:bg-muted'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Status Tabs & Search Bar */}
            <div className="flex flex-col md:flex-row gap-2">
              <div className="flex gap-1">
                {[
                  { label: '전체', value: 'all' },
                  { label: '활성', value: 'true' },
                  { label: '비활성', value: 'false' },
                ].map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() => {
                      setStatusFilter(tab.value);
                      setPagination((prev) => ({ ...prev, currentPage: 1 }));
                    }}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap transition-all border ${
                      statusFilter === tab.value
                        ? 'bg-[hsl(var(--sr-primary-dark))] text-white border-[hsl(var(--sr-primary-dark))] shadow-sm'
                        : 'bg-white text-muted-foreground border-border hover:bg-muted'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="고객사명, 코드로 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-xs bg-background rounded-full border-muted-foreground/20 focus-visible:ring-primary/20"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Total Count - 테이블 바로 위 */}
        <div className="px-6 py-2 border-b border-[hsl(var(--sr-border))] flex justify-end bg-slate-50/50">
          <div className="text-xs text-muted-foreground font-medium">
            전체{' '}
            <span className="text-[hsl(var(--sr-primary-dark))] font-bold">
              {pagination.totalItems}
            </span>
            개
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
                onClick={() => handlePageChange(pagination.currentPage - 1)}
                disabled={pagination.currentPage === 1}
              >
                이전
              </Button>
              <span className="text-sm text-muted-foreground">
                {pagination.currentPage} / {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(pagination.currentPage + 1)}
                disabled={pagination.currentPage === pagination.totalPages}
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
