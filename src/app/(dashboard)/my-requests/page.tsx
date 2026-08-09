'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { SRStatus } from '@prisma/client';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { AlertCircle, Clock, FileText, Filter } from 'lucide-react';

import { CreateSRDialog } from '@/components/srs/CreateSRDialog';
import { Badge } from '@/components/ui';
import { Button } from '@/components/ui';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { Progress } from '@/components/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { useToast } from '@/hooks/use-toast';
import { statusLabelOf } from '@/lib/constants/sr';

interface MySR {
  id: string;
  srNumber: string;
  title: string;
  // description(무제한 TEXT)은 목록 응답에 포함되지 않는다 — 상세 페이지에서 조회한다.
  status: SRStatus;
  requestedPriority: string;
  actualPriority?: string | null;
  requestedCompletionDate?: string | null;
  estimatedCompletionDate?: string | null;
  dueDate?: string | null;
  createdAt: string;
  updatedAt: string;
  intakeAt?: string | null;
  resolvedAt?: string | null;
  completedAt?: string | null;
  waitingMinutes: number;
  waitingHours: number;
  progressPercentage: number;
  client: {
    id: string;
    code: string;
    name: string;
  };
  serviceCategory: {
    id: string;
    categoryName: string;
    slaHours: number;
    priority: string;
  };
  assignee?: {
    id: string;
    name: string;
    email: string;
  } | null;
  intakeBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
  _count: {
    comments: number;
    attachments: number;
  };
}

interface MyRequestStats {
  total: number;
  requested: number;
  inProgress: number;
  completed: number;
}

/**
 * 상태 목록은 Prisma `SRStatus` enum 에서 도출한다.
 *
 * 이전에는 스키마에 없는 RESOLVED/CANCELLED 를 필터에 노출하고
 * 실재하는 INTAKE/ON_HOLD/REJECTED 는 빠뜨려, 선택 시 Prisma 가 알 수 없는 enum 값을
 * 받아 500 이 났고 REJECTED SR 은 이름 없는 배지로 렌더링됐다.
 */
const STATUS_ORDER = [
  SRStatus.REQUESTED,
  SRStatus.INTAKE,
  SRStatus.IN_PROGRESS,
  SRStatus.ON_HOLD,
  SRStatus.COMPLETED,
  SRStatus.CONFIRMED,
  SRStatus.REJECTED,
] as const;

/**
 * 상태 **라벨** 사본은 정본(@/lib/constants/sr)으로 흡수했다(2026-08-10).
 *
 * 7키 중 4키가 정본과 달랐다 — 같은 SR 이 이 화면에서는 '접수 대기'/'진행 중'/
 * '확인됨'/'거부됨' 인데 /srs 에서는 '요청됨'/'진행중'/'확인완료'/'거절' 로 보였다.
 * 목록에서 본 이름과 상세에서 본 이름이 달라 사용자가 다른 단계로 읽는다.
 * (IN_PROGRESS 는 공백 하나 차이라 눈으로는 같아 보이지만 exact 매칭에서는 다르다.)
 *
 * **색(statusColors)은 흡수하지 않는다.** 아래 맵에는 'outline' 이 있는데 정본
 * statusBadgeVariants 의 유니온에는 없다. 타입을 넓혀 억지로 합치면 통합이 아니라
 * 배지 색 리디자인이 되고, constants/sr.ts 가 소유자 판단으로 격리해 둔 항목을
 * 우회하게 된다. 색 통합은 네 화면을 함께 보고 결정할 별건이다.
 */
const statusColors: Record<SRStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  REQUESTED: 'secondary',
  INTAKE: 'secondary',
  IN_PROGRESS: 'default',
  ON_HOLD: 'secondary',
  COMPLETED: 'outline',
  CONFIRMED: 'outline',
  REJECTED: 'destructive',
};

const priorityLabels: Record<string, string> = {
  CRITICAL: '긴급',
  HIGH: '높음',
  MEDIUM: '보통',
  LOW: '낮음',
};

const priorityColors: Record<string, 'default' | 'secondary' | 'destructive'> = {
  CRITICAL: 'destructive',
  HIGH: 'destructive',
  MEDIUM: 'default',
  LOW: 'secondary',
};

const PAGE_SIZE = 20;

const EMPTY_STATS: MyRequestStats = { total: 0, requested: 0, inProgress: 0, completed: 0 };

export default function MyRequestsPage() {
  const [srs, setSrs] = useState<MySR[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('createdAt');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  // 통계는 페이지가 아니라 서버가 요청자 전체 SR 기준으로 계산해 내려준다.
  const [stats, setStats] = useState<MyRequestStats>(EMPTY_STATS);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const { toast } = useToast();

  const fetchMyRequests = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      params.append('sortBy', sortBy);
      params.append('page', String(page));
      params.append('pageSize', String(PAGE_SIZE));

      const response = await fetch(`/api/srs/my-requests?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch my requests');

      const body = await response.json();
      setSrs(body.data ?? []);
      setStats(body.stats ?? EMPTY_STATS);
      setTotalPages(body.meta?.totalPages ?? 1);
      setTotalItems(body.meta?.totalItems ?? 0);
    } catch {
      // 에러는 toast로 사용자에게 표시
      toast({
        title: '오류',
        description: '요청 목록을 불러오는데 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, sortBy, page, toast]);

  useEffect(() => {
    fetchMyRequests();
  }, [fetchMyRequests]);

  // 필터·정렬이 바뀌면 첫 페이지로 되돌린다. 그렇지 않으면 결과가 없는 페이지에 머무를 수 있다.
  useEffect(() => {
    setPage(1);
  }, [statusFilter, sortBy]);

  if (loading) {
    return (
      <div className="sr-loading">
        <div className="sr-loading-spinner"></div>
        <p className="text-muted-foreground">내 요청 SR을 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="sr-content-area space-y-6 sr-fade-in">
      {/* 헤더 */}
      <div className="sr-list-head">
        <div>
          <h1 className="sr-list-title text-3xl">내 요청 SR</h1>
          <p className="text-muted-foreground mt-1">내가 요청한 SR의 진행 상황을 확인하세요.</p>
        </div>
        <Button
          onClick={() => setCreateDialogOpen(true)}
          className="bg-[hsl(var(--sr-primary-dark))] hover:bg-[hsl(var(--sr-primary-darker))]"
        >
          새 SR 요청
        </Button>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="sr-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">전체 요청</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[hsl(var(--sr-primary-dark))]">
              {stats.total}
            </div>
          </CardContent>
        </Card>

        <Card className="sr-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">요청됨</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[hsl(var(--sr-accent-orange))]">
              {stats.requested}
            </div>
          </CardContent>
        </Card>

        <Card className="sr-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">진행중</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[hsl(var(--sr-accent-blue))]">
              {stats.inProgress}
            </div>
          </CardContent>
        </Card>

        <Card className="sr-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">완료</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
          </CardContent>
        </Card>
      </div>

      {/* 필터 영역 */}
      <Card className="sr-card">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 font-semibold">
            <Filter className="h-5 w-5 text-[hsl(var(--sr-primary-dark))]" />
            필터 및 정렬
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">상태</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="전체 상태" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 상태</SelectItem>
                  {STATUS_ORDER.map((status) => (
                    <SelectItem key={status} value={status}>
                      {statusLabelOf(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">정렬 기준</label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="createdAt">요청일</SelectItem>
                  <SelectItem value="updatedAt">최근 업데이트</SelectItem>
                  <SelectItem value="status">상태</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SR 목록 */}
      <div className="space-y-4">
        {srs.length === 0 ? (
          <div className="sr-empty-state">
            <FileText className="sr-empty-state-icon" />
            <h3 className="sr-empty-state-title">요청한 SR이 없습니다</h3>
            <p className="sr-empty-state-description">
              아직 요청한 SR이 없습니다. 첫 SR을 요청하여 업무를 시작하세요.
            </p>
            <Button
              onClick={() => setCreateDialogOpen(true)}
              className="bg-[hsl(var(--sr-primary-dark))] hover:bg-[hsl(var(--sr-primary-darker))]"
            >
              첫 SR 요청하기
            </Button>
          </div>
        ) : (
          srs.map((sr) => (
            <Card key={sr.id} className="sr-card border-l-4 border-l-[hsl(var(--sr-accent-blue))]">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/srs/${sr.id}`}
                        className="text-xl font-semibold text-[hsl(var(--sr-primary-dark))] hover:text-[hsl(var(--sr-accent-orange))] hover:underline transition-colors"
                      >
                        {sr.srNumber}
                      </Link>
                      <Badge variant={statusColors[sr.status]}>{statusLabelOf(sr.status)}</Badge>
                      <Badge variant={priorityColors[sr.requestedPriority]}>
                        {priorityLabels[sr.requestedPriority]}
                      </Badge>
                    </div>
                    <p className="text-lg font-medium text-foreground">{sr.title}</p>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <div className="space-y-4">
                  {/* 진행률 */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground font-medium">진행률</span>
                      <span className="font-semibold text-[hsl(var(--sr-accent-blue))]">
                        {sr.progressPercentage}%
                      </span>
                    </div>
                    <Progress value={sr.progressPercentage} className="h-2" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* 고객사 및 카테고리 */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">고객사:</span>
                        <span className="font-medium">{sr.client.name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">카테고리:</span>
                        <span className="font-medium">{sr.serviceCategory.categoryName}</span>
                      </div>
                    </div>

                    {/* 담당자 정보 */}
                    <div className="space-y-2">
                      {sr.assignee ? (
                        <>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-muted-foreground">담당자:</span>
                            <span className="font-medium">{sr.assignee.name}</span>
                          </div>
                          {sr.intakeBy && (
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-muted-foreground">접수자:</span>
                              <span>{sr.intakeBy.name}</span>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center gap-2 text-sm">
                          <AlertCircle className="h-4 w-4 text-orange-600" />
                          {/* 상태 이름이 아니라 "아직 접수되지 않았다" 는 서술이다 — 정본 라벨과 별개. */}
                          <span className="text-orange-600">접수 대기 중</span>
                        </div>
                      )}
                    </div>

                    {/* 날짜 정보 */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">요청:</span>
                        <span>
                          {formatDistanceToNow(new Date(sr.createdAt), {
                            addSuffix: true,
                            locale: ko,
                          })}
                        </span>
                      </div>
                      {sr.status === 'REQUESTED' && sr.waitingHours > 0 && (
                        <div className="flex items-center gap-2 text-sm text-orange-600">
                          <AlertCircle className="h-4 w-4" />
                          <span>대기 중: {sr.waitingHours.toFixed(1)}시간</span>
                        </div>
                      )}
                      {sr.estimatedCompletionDate && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">예상 완료:</span>
                          <span className="font-medium">
                            {new Date(sr.estimatedCompletionDate).toLocaleDateString('ko-KR')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 첨부파일 및 댓글 */}
                  <div className="flex items-center justify-between pt-4 border-t">
                    <div className="flex gap-4 text-sm text-muted-foreground">
                      {sr._count?.attachments > 0 && (
                        <span>📎 첨부파일 {sr._count.attachments}개</span>
                      )}
                      {sr._count?.comments > 0 && <span>💬 댓글 {sr._count.comments}개</span>}
                    </div>
                    <Link href={`/srs/${sr.id}`}>
                      <Button variant="outline" size="sm">
                        상세 보기
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <nav
          aria-label="내 요청 SR 페이지네이션"
          className="flex items-center justify-between gap-4 pt-2"
        >
          <p className="text-sm text-muted-foreground">
            전체 {totalItems}건 중 {(page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, totalItems)}건
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              이전
            </Button>
            <span className="text-sm text-muted-foreground tabular-nums">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              다음
            </Button>
          </div>
        </nav>
      )}

      {/* SR 생성 다이얼로그 */}
      <CreateSRDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={() => {
          setCreateDialogOpen(false);
          fetchMyRequests(); // SR 목록 새로고침
        }}
      />
    </div>
  );
}
