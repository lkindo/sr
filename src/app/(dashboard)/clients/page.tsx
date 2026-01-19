'use client';

import { ChevronDown, ChevronRight, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';

import { ClientDialog } from '@/components/clients/ClientDialog';
import { ClientUsersSheet } from '@/components/clients/ClientUsersSheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    <div className="flex justify-center items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                      <span className="text-muted-foreground">로딩 중...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : clients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12">
                    <div className="flex flex-col items-center gap-3">
                      <p className="text-muted-foreground">등록된 고객사가 없습니다.</p>
                      <Button variant="outline" size="sm" onClick={handleCreateClient}>
                        <Plus className="mr-2 h-4 w-4" />첫 고객사 등록하기
                      </Button>
                    </div>
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
                        <TableCell className="text-center">{client.industry || '-'}</TableCell>
                        <TableCell className="text-center">{client.contactPerson || '-'}</TableCell>
                        <TableCell>{client.contactEmail || '-'}</TableCell>
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
                          <Badge variant="secondary">{client._count?.srs || 0}건</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={client.isActive ? 'default' : 'secondary'}>
                            {client.isActive ? '활성' : '비활성'}
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
