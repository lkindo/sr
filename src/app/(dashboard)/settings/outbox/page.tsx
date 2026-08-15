'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock, RotateCcw } from 'lucide-react';

import { Badge } from '@/components/ui';
import { Button } from '@/components/ui';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiPost, retryUnlessClientError } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { formatAppZoneDate, formatAppZoneTime } from '@/lib/timezone';

/**
 * 알림 발송 이력 (ADMIN 전용).
 *
 * 헌법 §4.1 은 "발송 실패는 조회 가능해야 한다" 고 규정한다. 아웃박스는 실패를
 * `notifications` 에 `FAILED` + `failReason` 으로 남기지만, 보여 주는 곳이 없으면
 * 운영자는 DB 에 직접 붙어야 하고 — 그건 사실상 아무도 확인하지 않는다는 뜻이다.
 *
 * **본문(`content`)은 표시하지 않는다.** API 가 애초에 내려보내지 않으며, 운영자가
 * 알아야 하는 것은 "무엇이 왜 실패했는가" 지 수신자에게 간 메일 본문이 아니다.
 */

type OutboxStatus = 'FAILED' | 'PENDING' | 'SENT';

interface OutboxRow {
  id: string;
  type: string;
  status: OutboxStatus;
  recipient: string;
  subject: string | null;
  attempts: number;
  failReason: string | null;
  nextAttemptAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

interface OutboxResponse {
  data: OutboxRow[];
  meta: { totalItems: number };
  stats: { pending: number; sent: number; failed: number };
}

/** 탭 정의. 실패를 먼저 보여 준다 — 이 화면을 여는 이유가 대개 그것이다. */
const TABS: { status: OutboxStatus; label: string; icon: typeof AlertTriangle }[] = [
  { status: 'FAILED', label: '실패', icon: AlertTriangle },
  { status: 'PENDING', label: '대기', icon: Clock },
  { status: 'SENT', label: '발송됨', icon: CheckCircle2 },
];

const STATUS_VARIANT: Record<OutboxStatus, 'destructive' | 'warning' | 'success'> = {
  FAILED: 'destructive',
  PENDING: 'warning',
  SENT: 'success',
};

/** `2026. 08. 15. 14:30` — 목록에서 한 줄에 들어가는 길이. */
function formatStamp(value: string | null): string {
  if (!value) return '-';
  return `${formatAppZoneDate(value)} ${formatAppZoneTime(value)}`;
}

export default function OutboxPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<OutboxStatus>('FAILED');

  const { data, isPending, error } = useQuery({
    queryKey: qk.outbox.list(status),
    queryFn: () => apiGet<OutboxResponse>(`/api/notifications/outbox?status=${status}`),
    retry: retryUnlessClientError,
  });

  const { mutate: resend, isPending: resending } = useMutation({
    mutationFn: (ids: string[]) =>
      apiPost<{ requeued: number; skipped: number; message: string }>(
        '/api/notifications/outbox',
        { ids },
        { fallbackMessage: '재발송에 실패했습니다.' }
      ),
    onSuccess: async (result) => {
      toast({ title: '재발송 요청됨', description: result.message });
      // 되살린 행은 PENDING 으로 옮겨 가므로 두 탭 모두 무효화한다.
      await queryClient.invalidateQueries({ queryKey: ['outbox'] });
    },
    onError: (err) => {
      toast({
        title: '오류',
        description: err instanceof Error ? err.message : '재발송에 실패했습니다.',
        variant: 'destructive',
      });
    },
  });

  const rows = data?.data ?? [];
  const stats = data?.stats;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">알림 발송 이력</h1>
        <p className="text-sm text-muted-foreground mt-1">
          이메일 알림의 발송 상태를 확인하고, 실패한 알림을 다시 보냅니다. 재발송한 알림은 최대 30초
          내에 처리됩니다.
        </p>
      </div>

      {stats && (
        <div className="grid gap-4 sm:grid-cols-3">
          {TABS.map(({ status: s, label, icon: Icon }) => {
            const count =
              s === 'FAILED' ? stats.failed : s === 'PENDING' ? stats.pending : stats.sent;
            return (
              <Card key={s} className="sr-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{label}</CardTitle>
                  <Icon className="h-5 w-5 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{count}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="sr-card">
        <CardHeader>
          <CardTitle>발송 목록</CardTitle>
          <CardDescription>
            메일 본문은 표시하지 않습니다. 수신자·제목·실패 사유만 확인할 수 있습니다.
          </CardDescription>
          <div className="flex gap-2 pt-2">
            {TABS.map(({ status: s, label }) => (
              <Button
                key={s}
                size="sm"
                variant={status === s ? 'default' : 'outline'}
                onClick={() => setStatus(s)}
              >
                {label}
              </Button>
            ))}
            {status === 'FAILED' && rows.length > 0 && (
              <Button
                size="sm"
                variant="secondary"
                className="ml-auto"
                disabled={resending}
                onClick={() => resend(rows.map((row) => row.id))}
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                {resending ? '요청 중...' : `이 목록 전체 재발송 (${rows.length}건)`}
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {isPending ? (
            <p className="text-sm text-muted-foreground">불러오는 중...</p>
          ) : error ? (
            <p className="text-sm text-destructive">목록을 불러오지 못했습니다.</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">해당 상태의 알림이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">상태</th>
                    <th className="py-2 pr-4 font-medium">수신자</th>
                    <th className="py-2 pr-4 font-medium">제목</th>
                    <th className="py-2 pr-4 font-medium">시도</th>
                    <th className="py-2 pr-4 font-medium">실패 사유</th>
                    <th className="py-2 pr-4 font-medium">시각</th>
                    <th className="py-2 font-medium sr-only">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0 align-top">
                      <td className="py-2 pr-4">
                        <Badge variant={STATUS_VARIANT[row.status]}>{row.status}</Badge>
                      </td>
                      <td className="py-2 pr-4">{row.recipient}</td>
                      <td className="py-2 pr-4">{row.subject ?? '-'}</td>
                      <td className="py-2 pr-4 tabular-nums">{row.attempts}</td>
                      <td className="py-2 pr-4 max-w-xs break-words text-muted-foreground">
                        {row.failReason ?? '-'}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                        {/* 발송됐으면 발송 시각, 대기 중이면 다음 시도 시각이 궁금하다. */}
                        {row.status === 'SENT'
                          ? formatStamp(row.sentAt)
                          : row.status === 'PENDING'
                            ? formatStamp(row.nextAttemptAt ?? row.createdAt)
                            : formatStamp(row.createdAt)}
                      </td>
                      <td className="py-2">
                        {row.status === 'FAILED' && (
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={resending}
                            onClick={() => resend([row.id])}
                          >
                            재발송
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
