'use client';

import type { MouseEvent } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Inbox, Plus, SearchX } from 'lucide-react';

import { Button } from '@/components/ui';
import { Input } from '@/components/ui';
import { Label } from '@/components/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { TableHead } from '@/components/ui';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui';

import { priorityLabels, statusLabels } from './constants';

const ITEMS_PER_PAGE_OPTIONS = [10, 20, 30, 50, 100];

export type SortField =
  'srNumber' | 'title' | 'client' | 'priority' | 'status' | 'createdAt' | 'dueDate';
export type SortOrder = 'asc' | 'desc';
export type ClientListItem = { id: string; code: string; name: string };
// 담당자 필터는 id 와 name 만 렌더링한다. email 을 요구하면 서버가 그것을
// RSC 페이로드로 실어 보내야 하고, 그게 정확히 감사 4.2 가 지적한 유출이었다.
export type UserListItem = { id: string; name: string };
export type PaginationInfo = {
  currentPage: number;
  itemsPerPage: number;
  totalCount: number;
  totalPages: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
};

// --destructive(#ef4444) 위 흰 글씨는 3.76:1 로 AA(4.5:1) 미달이다.
// 채움 배경에는 --destructive-solid 를 쓴다 — Button 의 destructive
// variant 가 같은 이유로 이미 그렇게 바뀌어 있다(ui/button.tsx).
export const QUICK_FILTER_ALERT_BADGE = 'bg-destructive-solid text-destructive-foreground';
export const QUICK_FILTER_QUIET_BADGE = 'bg-muted text-foreground';

export function QuickFilterButton({
  active,
  onToggle,
  icon: Icon,
  label,
  count,
  idleBadgeClassName,
}: {
  active: boolean;
  onToggle: () => void;
  icon: React.ElementType;
  label: string;
  count: number;
  idleBadgeClassName: string;
}) {
  return (
    <button
      aria-pressed={active}
      onClick={onToggle}
      className={`flex min-h-9 items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
        active
          ? 'bg-primary/10 text-primary border-primary shadow-sm'
          : 'bg-transparent text-muted-foreground border-border hover:bg-muted font-medium'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
      <span
        className={`px-1.5 rounded-full text-[11px] min-w-5 text-center ${
          active ? 'bg-background text-foreground font-bold' : idleBadgeClassName
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function multiValueLabel(value: string, labels: Record<string, string>): string {
  const byValue = new Map(Object.entries(labels));
  return value
    .split(',')
    .map((item) => byValue.get(item) ?? item)
    .join('·');
}

/** 상태·우선순위 필터. 같은 키가 여러 값으로 들어왔으면 그 묶음을 한 항목으로 따로 보여 준다. */
function LabeledValueSelect({
  id,
  label,
  allLabel,
  value,
  labels,
  onChange,
}: {
  id: string;
  label: string;
  allLabel: string;
  value: string;
  labels: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-sm mb-2 block">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="sr-input-template w-full">
          <SelectValue placeholder={allLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{allLabel}</SelectItem>
          {value.includes(',') && (
            <SelectItem value={value}>{multiValueLabel(value, labels)}</SelectItem>
          )}
          {Object.entries(labels).map(([itemValue, itemLabel]) => (
            <SelectItem key={itemValue} value={itemValue}>
              {itemLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DateFilter({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-sm mb-2 block">
        {label}
      </Label>
      <Input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="sr-input-template w-full"
        placeholder="년-월-일"
      />
    </div>
  );
}

export function SRAdvancedFilters({
  filters,
  clients,
  users,
  onFilterChange,
  onReset,
}: {
  filters: {
    status: string;
    priority: string;
    clientId: string;
    assigneeId: string;
    dateFrom: string;
    dateTo: string;
  };
  clients: ClientListItem[];
  users: UserListItem[];
  onFilterChange: (key: string, value: string) => void;
  onReset: () => void;
}) {
  return (
    <div
      id="advanced-filters-section"
      role="region"
      aria-label="상세 필터 옵션"
      className="mb-4 pb-4 border-b border-[hsl(var(--sr-border))] max-h-[280px] md:max-h-none overflow-y-auto no-scrollbar"
    >
      {/* First Row: Status, Priority, Client, Assignee */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <LabeledValueSelect
          id="filter-status"
          label="상태"
          allLabel="모든 상태"
          value={filters.status}
          labels={statusLabels}
          onChange={(v) => onFilterChange('status', v)}
        />
        <LabeledValueSelect
          id="filter-priority"
          label="우선순위"
          allLabel="모든 우선순위"
          value={filters.priority}
          labels={priorityLabels}
          onChange={(v) => onFilterChange('priority', v)}
        />
        <div>
          <Label htmlFor="filter-client" className="text-sm mb-2 block">
            고객사
          </Label>
          <Select value={filters.clientId} onValueChange={(v) => onFilterChange('clientId', v)}>
            <SelectTrigger id="filter-client" className="sr-input-template w-full">
              <SelectValue placeholder="모든 고객사" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">모든 고객사</SelectItem>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="filter-assignee" className="text-sm mb-2 block">
            담당자
          </Label>
          <Select value={filters.assigneeId} onValueChange={(v) => onFilterChange('assigneeId', v)}>
            <SelectTrigger id="filter-assignee" className="sr-input-template w-full">
              <SelectValue placeholder="모든 담당자" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">모든 담당자</SelectItem>
              <SelectItem value="unassigned">미배정</SelectItem>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {/* Second Row: Date Range */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <DateFilter
          id="filter-date-from"
          label="생성일 시작"
          value={filters.dateFrom}
          onChange={(v) => onFilterChange('dateFrom', v)}
        />
        <DateFilter
          id="filter-date-to"
          label="생성일 종료"
          value={filters.dateTo}
          onChange={(v) => onFilterChange('dateTo', v)}
        />
      </div>
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onReset}>
          필터 초기화
        </Button>
      </div>
    </div>
  );
}

export function SortableTableHead({
  field,
  label,
  sortField,
  sortOrder,
  onSort,
  className,
}: {
  field: SortField;
  label: string;
  sortField: SortField;
  sortOrder: SortOrder;
  onSort: (field: SortField) => void;
  className?: string;
}) {
  const sorted = sortField === field;
  const icon = !sorted ? (
    <ArrowUpDown className="ml-2 h-4 w-4" />
  ) : sortOrder === 'asc' ? (
    <ArrowUp className="ml-2 h-4 w-4" />
  ) : (
    <ArrowDown className="ml-2 h-4 w-4" />
  );

  return (
    <TableHead
      className={className}
      aria-sort={sorted ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <Button variant="ghost" onClick={() => onSort(field)}>
        {label}
        {icon}
      </Button>
    </TableHead>
  );
}

/** 표와 모바일 카드가 함께 쓰는 빈 목록 안내. */
export function SRListEmptyState({
  hasActiveFilters,
  canCreateSR,
  onReset,
  onCreate,
}: {
  hasActiveFilters: boolean;
  canCreateSR: boolean;
  onReset: () => void;
  onCreate: () => void;
}) {
  const Icon = hasActiveFilters ? SearchX : Inbox;
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50 mb-4">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium text-foreground">
        {hasActiveFilters ? '검색 결과가 없습니다' : 'SR이 없습니다'}
      </h3>
      <p className="text-sm text-muted-foreground mt-1 mb-6 max-w-sm">
        {hasActiveFilters
          ? '다른 검색어나 필터를 시도해보세요.'
          : '새로운 SR을 생성하거나 나중에 다시 확인해주세요.'}
      </p>
      {hasActiveFilters ? (
        <Button variant="outline" onClick={onReset}>
          필터 초기화
        </Button>
      ) : (
        canCreateSR && (
          <Button onClick={onCreate} className="sr-btn-template-primary">
            <Plus className="mr-2 h-4 w-4" /> SR 등록
          </Button>
        )
      )}
    </div>
  );
}

export function SRListPagination({
  itemsPerPage,
  paginationInfo,
  onItemsPerPageChange,
  onPageChange,
}: {
  itemsPerPage: string;
  paginationInfo: PaginationInfo;
  onItemsPerPageChange: (value: string) => void;
  onPageChange: (page: number) => void;
}) {
  const goTo = (e: MouseEvent, enabled: boolean, page: number) => {
    e.preventDefault();
    if (enabled) onPageChange(page);
  };

  return (
    <div className="px-6 py-4 border-t border-[hsl(var(--sr-border))] flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Select value={itemsPerPage} onValueChange={onItemsPerPageChange}>
          <SelectTrigger
            className="w-[80px] h-9 sr-dropdown-template"
            aria-label="페이지당 항목 수"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ITEMS_PER_PAGE_OPTIONS.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-[hsl(var(--sr-gray-medium))]">페이지당 항목 수</span>
      </div>

      {paginationInfo.totalPages > 1 && (
        <Pagination className="w-auto mx-0">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(e) => goTo(e, paginationInfo.hasPrevPage, paginationInfo.currentPage - 1)}
                aria-disabled={!paginationInfo.hasPrevPage}
                className={
                  !paginationInfo.hasPrevPage
                    ? 'pointer-events-none opacity-50 cursor-not-allowed'
                    : 'cursor-pointer'
                }
              />
            </PaginationItem>
            {/* PaginationContent 는 <ul> 이므로 직계 자식은 <li> 여야 한다.
                <div> 를 그대로 두면 axe 의 list/only-listitems 위반(serious)이 되고,
                낭독기는 목록 항목 수를 잘못 읽는다. PaginationItem 이 <li> 를 렌더한다. */}
            <PaginationItem className="flex items-center gap-1 text-sm font-medium mx-2">
              {paginationInfo.currentPage} / {paginationInfo.totalPages}
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(e) => goTo(e, paginationInfo.hasNextPage, paginationInfo.currentPage + 1)}
                aria-disabled={!paginationInfo.hasNextPage}
                className={
                  !paginationInfo.hasNextPage
                    ? 'pointer-events-none opacity-50 cursor-not-allowed'
                    : 'cursor-pointer'
                }
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
