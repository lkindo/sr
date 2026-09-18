'use client';

import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { Input } from '@/components/ui';
import { Label } from '@/components/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { apiGet, retryUnlessClientError } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { formatAppZoneDate, formatAppZoneTime } from '@/lib/timezone';

/**
 * 감사 로그 (ADMIN 전용, 2026-09-18 소유자 결정 D11).
 *
 * 헌법 §1.1 은 ADMIN 이 전체 감사 로그를 조회할 수 있다고 규정한다. 예전에는 읽는 코드가 없어 "누가 이 가입을
 * 승인했나" 같은 질문에 답하려면 서버에 SSH 로 들어가 SQL 을 쳐야 했다. SR 처리 이력(상태·활동)은 SR 상세의
 * 타임라인에 있으므로 여기서는 관리 행위(사용자·고객사·역할·카테고리·마감일 조정·삭제 등)를 본다.
 */

interface AuditRow {
  id: string;
  actionType: string;
  targetEntity: string;
  targetId: string | null;
  changes: unknown;
  ipAddress: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
}

interface AuditResponse {
  data: AuditRow[];
  meta: { currentPage: number; totalPages: number; totalItems: number };
  facets: { actionTypes: string[]; targetEntities: string[] };
}

/** 행위 이름. 어휘가 일반형(CREATE)과 접두형(ROLE_CREATE)으로 섞여 있어 아는 것만 옮기고 나머지는 원문을 쓴다. */
const ACTION_LABELS = new Map<string, string>([
  ['CREATE', '생성'],
  ['UPDATE', '수정'],
  ['DELETE', '삭제'],
  ['APPROVE', '가입 승인'],
  ['REJECT', '가입 거절'],
  ['USER_CREATE', '사용자 생성'],
  ['USER_UPDATE', '사용자 수정'],
  ['USER_DEACTIVATE', '사용자 비활성화'],
  ['USER_DELETE', '사용자 영구 삭제'],
  ['USER_ROLES_REPLACE', '역할 변경'],
  ['PASSWORD_CHANGE', '비밀번호 변경'],
  ['CLIENT_CREATE', '고객사 생성'],
  ['CLIENT_UPDATE', '고객사 수정'],
  ['CLIENT_DELETE', '고객사 삭제'],
  ['ROLE_CREATE', '역할 생성'],
  ['ROLE_UPDATE', '역할 수정'],
  ['ROLE_DELETE', '역할 삭제'],
  ['ROLE_PERMISSIONS_UPDATE', '역할 권한 변경'],
  ['SERVICE_CATEGORY_CREATE', '카테고리 생성'],
  ['SERVICE_CATEGORY_UPDATE', '카테고리 수정'],
  ['SERVICE_CATEGORY_DELETE', '카테고리 삭제'],
  ['LOGIN', '로그인'],
  ['LOGIN_FAILED', '로그인 실패'],
]);

const ENTITY_LABELS = new Map<string, string>([
  ['User', '사용자'],
  ['UserClient', '고객사 소속'],
  ['Client', '고객사'],
  ['Role', '역할'],
  ['ServiceCategory', '서비스 카테고리'],
  ['SR', 'SR'],
  ['SR_DUE_DATE', 'SR 마감일'],
  ['SRAttachment', 'SR 첨부'],
]);

const ALL = 'all';

function labelOf(labels: Map<string, string>, key: string): string {
  const label = labels.get(key);
  return label ? `${label} (${key})` : key;
}

function formatStamp(value: string): string {
  return `${formatAppZoneDate(value)} ${formatAppZoneTime(value)}`;
}

interface Filters {
  actionType: string;
  targetEntity: string;
  actor: string;
  from: string;
  to: string;
}

const EMPTY: Filters = { actionType: ALL, targetEntity: ALL, actor: '', from: '', to: '' };

function toQuery(filters: Filters, page: number): string {
  const params = new URLSearchParams({ page: String(page), pageSize: '50' });
  if (filters.actionType !== ALL) params.set('actionType', filters.actionType);
  if (filters.targetEntity !== ALL) params.set('targetEntity', filters.targetEntity);
  if (filters.actor.trim()) params.set('actor', filters.actor.trim());
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  return params.toString();
}

export default function AuditLogPage() {
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  const query = toQuery(applied, page);
  const { data, isPending, error } = useQuery({
    queryKey: qk.auditLogs.list(query),
    queryFn: () => apiGet<AuditResponse>(`/api/audit-logs?${query}`),
    retry: retryUnlessClientError,
  });

  const rows = data?.data ?? [];
  const meta = data?.meta;
  const facets = data?.facets ?? { actionTypes: [], targetEntities: [] };

  const apply = (next: Filters) => {
    setApplied(next);
    setPage(1);
    setExpanded(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">감사 로그</h1>
        <p className="text-sm text-muted-foreground mt-1">
          사용자·고객사·역할·카테고리 관리, 마감일 조정, 삭제 같은 관리 행위의 기록입니다. 기록은
          지우지 않고 영구 보존합니다. SR 처리 이력은 각 SR 상세의 타임라인에서 봅니다.
        </p>
      </div>

      <Card className="sr-card">
        <CardHeader>
          <CardTitle>조건</CardTitle>
          <CardDescription>
            기간은 한국 시간 기준 날짜입니다. 끝 날짜의 하루 전체를 포함합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-3 lg:grid-cols-6 items-end"
            onSubmit={(event) => {
              event.preventDefault();
              apply(draft);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="audit-entity">대상 종류</Label>
              <Select
                value={draft.targetEntity}
                onValueChange={(value) => setDraft({ ...draft, targetEntity: value })}
              >
                <SelectTrigger id="audit-entity">
                  <SelectValue placeholder="전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>전체</SelectItem>
                  {facets.targetEntities.map((entity) => (
                    <SelectItem key={entity} value={entity}>
                      {labelOf(ENTITY_LABELS, entity)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="audit-action">행위</Label>
              <Select
                value={draft.actionType}
                onValueChange={(value) => setDraft({ ...draft, actionType: value })}
              >
                <SelectTrigger id="audit-action">
                  <SelectValue placeholder="전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>전체</SelectItem>
                  {facets.actionTypes.map((action) => (
                    <SelectItem key={action} value={action}>
                      {labelOf(ACTION_LABELS, action)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="audit-actor">행위자(이름·이메일)</Label>
              <Input
                id="audit-actor"
                value={draft.actor}
                onChange={(event) => setDraft({ ...draft, actor: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="audit-from">시작 날짜</Label>
              <Input
                id="audit-from"
                type="date"
                value={draft.from}
                onChange={(event) => setDraft({ ...draft, from: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="audit-to">끝 날짜</Label>
              <Input
                id="audit-to"
                type="date"
                value={draft.to}
                onChange={(event) => setDraft({ ...draft, to: event.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit">조회</Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDraft(EMPTY);
                  apply(EMPTY);
                }}
              >
                초기화
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="sr-card">
        <CardHeader>
          <CardTitle>기록</CardTitle>
          <CardDescription>
            {meta ? `총 ${meta.totalItems}건. ` : ''}행위자가 비어 있는 기록은 영구 삭제된 사용자나
            시스템 처리입니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isPending ? (
            <p className="text-sm text-muted-foreground">불러오는 중...</p>
          ) : error ? (
            <p className="text-sm text-destructive">기록을 불러오지 못했습니다.</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">조건에 맞는 기록이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">시각</th>
                    <th className="py-2 pr-4 font-medium">행위자</th>
                    <th className="py-2 pr-4 font-medium">행위</th>
                    <th className="py-2 pr-4 font-medium">대상</th>
                    <th className="py-2 font-medium">변경 내용</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <Fragment key={row.id}>
                      <tr className="border-b last:border-0 align-top">
                        <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                          {formatStamp(row.createdAt)}
                        </td>
                        <td className="py-2 pr-4">
                          {row.user ? (
                            <>
                              <div>{row.user.name}</div>
                              <div className="text-xs text-muted-foreground">{row.user.email}</div>
                            </>
                          ) : (
                            <span className="text-muted-foreground">삭제된 사용자 또는 시스템</span>
                          )}
                        </td>
                        <td className="py-2 pr-4">{labelOf(ACTION_LABELS, row.actionType)}</td>
                        <td className="py-2 pr-4">
                          <div>{labelOf(ENTITY_LABELS, row.targetEntity)}</div>
                          {row.targetId && (
                            <div className="text-xs text-muted-foreground break-all">
                              {row.targetId}
                            </div>
                          )}
                        </td>
                        <td className="py-2">
                          <Button
                            size="xs"
                            variant="outline"
                            aria-expanded={expanded === row.id}
                            onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                          >
                            {expanded === row.id ? '접기' : '펼치기'}
                          </Button>
                        </td>
                      </tr>
                      {expanded === row.id && (
                        <tr className="border-b">
                          <td colSpan={5} className="pb-3">
                            <pre className="text-xs whitespace-pre-wrap break-all rounded-[8px] bg-muted p-3">
                              {JSON.stringify(row.changes, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-end gap-2 pt-4">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                이전
              </Button>
              <span className="text-sm text-muted-foreground tabular-nums">
                {meta.currentPage} / {meta.totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= meta.totalPages}
                onClick={() => setPage(page + 1)}
              >
                다음
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
