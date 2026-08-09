'use client';

import { useEffect, useRef } from 'react';
import type { SRActivityType } from '@prisma/client';
import { Loader2 } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui';
import { Badge } from '@/components/ui';
import { Button } from '@/components/ui';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { useSRActivitiesInfinite } from '@/hooks/use-sr-infinite';

interface SRActivitiesProps {
  srId: string;
}

/**
 * 활동 유형 라벨.
 *
 * `Record<SRActivityType, ...>` 로 못박는다. 예전에는 `Record<string, string>` 이라
 * 키가 스키마와 어긋나도 타입 검사가 통과했고, 실제로 6개 중 4개가 존재하지 않는
 * 키였다 — UPDATED / STATUS_CHANGE / COMMENT / ATTACHMENT. prisma 의 enum 은
 * STATUS_CHANGED / COMMENTED / ATTACHMENT_ADDED 처럼 다른 이름이라, 12개 유형 중
 * 10개가 `|| activity.type` 폴백으로 떨어져 한국어 화면에 "ATTACHMENT_ADDED" 같은
 * 영문 enum 이 그대로 찍혔다. 이제 유형이 늘면 여기서 컴파일이 깨진다.
 */
const activityTypeLabels: Record<SRActivityType, string> = {
  CREATED: '생성',
  STATUS_CHANGED: '상태 변경',
  PRIORITY_CHANGED: '우선순위 변경',
  ASSIGNED: '담당자 지정',
  REASSIGNED: '담당자 변경',
  COMMENTED: '댓글',
  ATTACHMENT_ADDED: '첨부 추가',
  ATTACHMENT_REMOVED: '첨부 삭제',
  REOPENED: '재요청',
  COMPLETED: '완료',
  REJECTED: '반려',
  INTAKE_UPDATED: '접수 정보 수정',
};

const activityTypeColors: Record<SRActivityType, 'default' | 'secondary' | 'destructive'> = {
  CREATED: 'default',
  STATUS_CHANGED: 'default',
  PRIORITY_CHANGED: 'secondary',
  ASSIGNED: 'default',
  REASSIGNED: 'secondary',
  COMMENTED: 'secondary',
  ATTACHMENT_ADDED: 'secondary',
  ATTACHMENT_REMOVED: 'secondary',
  REOPENED: 'destructive',
  COMPLETED: 'default',
  REJECTED: 'destructive',
  INTAKE_UPDATED: 'secondary',
};

/**
 * 서버가 내려주는 `type` 은 직렬화를 거치며 `string` 이 된다.
 * 알려진 유형이면 라벨/색을, 아니면(스키마가 앞서 나간 경우) 원문을 그대로 쓴다.
 */
function isKnownActivityType(type: string): type is SRActivityType {
  return type in activityTypeLabels;
}

export function SRActivities({ srId }: SRActivitiesProps) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error } =
    useSRActivitiesInfinite(srId);

  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Intersection Observer로 자동 로딩
  useEffect(() => {
    if (!loadMoreRef.current || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loadMoreRef.current);

    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const allActivities = data?.pages.flatMap((page) => page.activities) || [];
  const totalCount = allActivities.length;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8" role="status" aria-live="polite">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">활동 이력을 불러오는 중</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-destructive py-8">활동 이력을 불러오는데 실패했습니다.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>활동 이력 ({totalCount})</CardTitle>
        <CardDescription>이 SR의 모든 활동 이력을 시간순으로 확인할 수 있습니다.</CardDescription>
      </CardHeader>
      <CardContent>
        {allActivities.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">활동 이력이 없습니다.</p>
        ) : (
          <>
            <div className="relative space-y-4">
              <div className="absolute left-5 top-0 h-full w-px bg-border" />
              {allActivities.map((activity) => (
                <div key={activity.id} className="relative flex gap-4">
                  <Avatar className="relative z-10">
                    <AvatarImage src={activity.user.image || ''} alt={activity.user.name} />
                    <AvatarFallback>{getInitials(activity.user.name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-1 pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{activity.user.name}</span>
                      <Badge
                        variant={
                          isKnownActivityType(activity.type)
                            ? activityTypeColors[activity.type]
                            : 'secondary'
                        }
                        className="text-xs"
                      >
                        {isKnownActivityType(activity.type)
                          ? activityTypeLabels[activity.type]
                          : activity.type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(activity.createdAt).toLocaleString('ko-KR')}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{activity.description}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* 무한 스크롤 트리거 */}
            {hasNextPage && (
              <div ref={loadMoreRef} className="mt-4 flex justify-center">
                {isFetchingNextPage ? (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                ) : (
                  <Button onClick={() => fetchNextPage()} variant="outline" size="sm">
                    더 보기
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
