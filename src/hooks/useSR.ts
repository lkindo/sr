// src/hooks/useSR.ts
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export interface SR {
  id: string;
  srNumber: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  requestedCompletionDate?: string;
  dueDate?: string;
  actualCompletionDate?: string;
  client: {
    id: string;
    name: string;
    code: string;
  };
  category?: {
    id: string;
    name: string;
  };
  requester: {
    id: string;
    name: string;
    email: string;
  };
  assignedTo?: {
    id: string;
    name: string;
    email: string;
  } | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    comments: number;
    attachments: number;
  };
}

export interface FilterOptions {
  status?: string;
  priority?: string;
  clientId?: string;
  assigneeId?: string;
  searchQuery?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface SortOptions {
  field: "srNumber" | "title" | "client" | "priority" | "status" | "createdAt" | "dueDate";
  order: "asc" | "desc";
}

export interface PaginationOptions {
  page: number;
  itemsPerPage: number;
}

export interface UseSRsOptions {
  filters?: FilterOptions;
  sort?: SortOptions;
  pagination?: PaginationOptions;
}

export function useSR(srId: string) {
  return useQuery<SR, Error>({
    queryKey: ["sr", srId],
    queryFn: async () => {
      const response = await fetch(`/api/srs/${srId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch SR");
      }
      return response.json();
    },
    enabled: !!srId, // srId가 있을 때만 쿼리 실행
  });
}

export function useSRs(options?: UseSRsOptions) {
  const {
    filters = {},
    sort = { field: "createdAt", order: "desc" },
    pagination = { page: 1, itemsPerPage: 20 }
  } = options || {};

  const queryResult = useQuery<SR[], Error>({
    queryKey: ["srs", filters, sort],
    queryFn: async () => {
      // API 호출 시 필터 및 정렬 옵션 전달
      const params = new URLSearchParams();
      
      if (filters.status) params.append("status", filters.status);
      if (filters.priority) params.append("priority", filters.priority);
      if (filters.clientId) params.append("clientId", filters.clientId);
      
      const response = await fetch(`/api/srs?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch SRs");
      }
      return response.json();
    },
  });

  // 필터링, 정렬, 페이징 로직
  const processedData = useMemo(() => {
    if (!queryResult.data) {
      return { data: [], totalCount: 0, totalPages: 0, hasNextPage: false, hasPrevPage: false };
    }

    let filtered = [...queryResult.data];

    // 검색어 필터링
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (sr) =>
          sr.srNumber.toLowerCase().includes(query) ||
          sr.title.toLowerCase().includes(query) ||
          sr.client.name.toLowerCase().includes(query) ||
          sr.requester.name.toLowerCase().includes(query) ||
          (sr.assignedTo?.name || "").toLowerCase().includes(query)
      );
    }

    // 상태 필터링
    if (filters.status && filters.status !== "all") {
      filtered = filtered.filter((sr) => sr.status === filters.status);
    }

    // 우선순위 필터링
    if (filters.priority && filters.priority !== "all") {
      filtered = filtered.filter((sr) => sr.priority === filters.priority);
    }

    // 고객사 필터링
    if (filters.clientId && filters.clientId !== "all") {
      filtered = filtered.filter((sr) => sr.client.name === filters.clientId);
    }

    // 담당자 필터링
    if (filters.assigneeId) {
      if (filters.assigneeId === "unassigned") {
        filtered = filtered.filter((sr) => !sr.assignedTo);
      } else {
        filtered = filtered.filter((sr) => sr.assignedTo?.name === filters.assigneeId);
      }
    }

    // 생성일 범위 필터링
    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      fromDate.setHours(0, 0, 0, 0);
      filtered = filtered.filter((sr) => new Date(sr.createdAt) >= fromDate);
    }

    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter((sr) => new Date(sr.createdAt) <= toDate);
    }

    // 정렬
    filtered.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sort.field) {
        case "srNumber":
          aValue = a.srNumber;
          bValue = b.srNumber;
          break;
        case "title":
          aValue = a.title.toLowerCase();
          bValue = b.title.toLowerCase();
          break;
        case "client":
          aValue = a.client.name.toLowerCase();
          bValue = b.client.name.toLowerCase();
          break;
        case "priority":
          const priorityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
          aValue = priorityOrder[a.priority as keyof typeof priorityOrder];
          bValue = priorityOrder[b.priority as keyof typeof priorityOrder];
          break;
        case "status":
          aValue = a.status;
          bValue = b.status;
          break;
        case "createdAt":
          aValue = new Date(a.createdAt).getTime();
          bValue = new Date(b.createdAt).getTime();
          break;
        case "dueDate":
          aValue = a.dueDate ? new Date(a.dueDate).getTime() : 0;
          bValue = b.dueDate ? new Date(b.dueDate).getTime() : 0;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sort.order === "asc" ? -1 : 1;
      if (aValue > bValue) return sort.order === "asc" ? 1 : -1;
      return 0;
    });

    // 페이징
    const totalCount = filtered.length;
    const totalPages = Math.ceil(totalCount / pagination.itemsPerPage);
    const startIndex = (pagination.page - 1) * pagination.itemsPerPage;
    const paginatedData = filtered.slice(startIndex, startIndex + pagination.itemsPerPage);

    return {
      data: paginatedData,
      totalCount,
      totalPages,
      hasNextPage: pagination.page < totalPages,
      hasPrevPage: pagination.page > 1
    };
  }, [queryResult.data, filters, sort, pagination]);

  return {
    ...queryResult,
    data: processedData.data,
    paginationInfo: {
      totalCount: processedData.totalCount,
      totalPages: processedData.totalPages,
      hasNextPage: processedData.hasNextPage,
      hasPrevPage: processedData.hasPrevPage,
      currentPage: pagination.page,
      itemsPerPage: pagination.itemsPerPage
    }
  };
}