'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useSRCommentsInfinite } from '@/hooks/use-sr-infinite';
import { useToast } from '@/hooks/use-toast';

interface SRCommentsProps {
  srId: string;
}

export function SRComments({ srId }: SRCommentsProps) {
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // React Query 무한 스크롤
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error } =
    useSRCommentsInfinite(srId);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newComment.trim()) {
      toast({
        title: '오류',
        description: '댓글 내용을 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(`/api/srs/${srId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: newComment,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create comment');
      }

      setNewComment('');
      setSubmitting(false); // UI 먼저 해제

      toast({
        title: '성공',
        description: '댓글이 추가되었습니다.',
      });

      // React Query 캐시 무효화 및 서버 컴포넌트 갱신 (비동기로 실행)
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sr', srId, 'comments'] }),
        // router.refresh()는 Promise를 반환하지 않지만 비동기적 효과가 있음
        Promise.resolve(router.refresh()),
      ]);
    } catch (error) {
      setSubmitting(false); // 에러 발생 시에도 해제
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : '댓글 추가에 실패했습니다.',
        variant: 'destructive',
      });
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const allComments = data?.pages.flatMap((page) => page.comments) || [];
  const totalCount = allComments.length;

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
          <p className="text-center text-destructive py-8">댓글을 불러오는데 실패했습니다.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>새 댓글 작성</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="댓글을 입력하세요..."
              rows={3}
              disabled={submitting}
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={submitting}>
                <Send className="mr-2 h-4 w-4" />
                {submitting ? '추가 중...' : '댓글 추가'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>댓글 ({totalCount})</CardTitle>
          <CardDescription>이 SR에 달린 모든 댓글을 확인할 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent>
          {allComments.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">아직 댓글이 없습니다.</p>
          ) : (
            <>
              <div className="space-y-4">
                {allComments.map((comment) => (
                  <div key={comment.id} className="flex gap-4">
                    <Avatar>
                      <AvatarImage src={comment.user.image || ''} alt={comment.user.name} />
                      <AvatarFallback>{getInitials(comment.user.name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{comment.user.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(comment.createdAt).toLocaleString('ko-KR')}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
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
    </div>
  );
}
