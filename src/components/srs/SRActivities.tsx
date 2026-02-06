'use client';

import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui';
import { Badge } from '@/components/ui';
import { Button } from '@/components/ui';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { useSRActivitiesInfinite } from '@/hooks/use-sr-infinite';

interface SRActivitiesProps {
  srId: string;
}

const activityTypeLabels: Record<string, string> = {
  CREATED: '생성',
  UPDATED: '수정',
  STATUS_CHANGE: '상태 변경',
  ASSIGNED: '담당자 지정',
  COMMENT: '댓글',
  ATTACHMENT: '첨부파일',
};

const activityTypeColors: Record<string, 'default' | 'secondary' | 'destructive'> = {
  CREATED: 'default',
  UPDATED: 'secondary',
  STATUS_CHANGE: 'default',
  ASSIGNED: 'default',
  COMMENT: 'secondary',
  ATTACHMENT: 'secondary',
};

export function SRActivities({ srId }: SRActivitiesProps) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error } =
    useSRActivitiesInfinite(srId);

  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Intersection Observer로 자동 로딩
  useEffect(() => {
    if (!loadMoreRef.current || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
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
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
                        variant={activityTypeColors[activity.type] || 'secondary'}
                        className="text-xs"
                      >
                        {activityTypeLabels[activity.type] || activity.type}
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
