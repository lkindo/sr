'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui';
import { logger } from '@/lib/logger';

/**
 * 대시보드 셸 **안에서** 렌더링되는 에러 바운더리 (감사 4.4).
 *
 * 예전에는 `src/app/error.tsx` 하나뿐이었고, 그것이 `flex h-screen w-full` 로
 * 전체 뷰포트를 점유해 Header/Sidebar/Footer 를 통째로 대체했다. SR 목록을 불러오다
 * 일시적인 DB 오류가 나면 사용자는 **내비게이션도 헤더도 없는 맨 화면**에 떨어졌고,
 * 돌아갈 수 있는 유일한 방법은 브라우저 뒤로 가기였다.
 *
 * 이 경계는 `(dashboard)` 세그먼트에만 적용되므로 레이아웃은 그대로 살아 있다.
 * 높이를 뷰포트에 고정하지 않고(`min-h`) 콘텐츠 영역만 차지한다.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 프로젝트 자체 `no-console` 규칙에 맞춰 구조화 로거를 쓴다.
    logger.error('대시보드 페이지 오류', error, { custom_digest: error.digest });
  }, [error]);

  return (
    <div
      role="alert"
      className="flex min-h-[50vh] w-full flex-col items-center justify-center gap-4"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" aria-hidden="true" />
        <h2 className="text-2xl font-bold tracking-tight">문제가 발생했습니다</h2>
        <p className="text-muted-foreground">
          요청을 처리하는 도중 예기치 않은 오류가 발생했습니다.
        </p>
        {/*
          digest 는 서버 로그의 해당 오류를 찾는 키다. 사용자가 문의할 때 이 값을
          전달하면 스택을 노출하지 않고도 정확한 인시던트를 특정할 수 있다.
        */}
        {error.digest && <p className="text-xs text-muted-foreground">오류 코드: {error.digest}</p>}
      </div>
      <div className="flex gap-2">
        <Button onClick={() => reset()}>다시 시도</Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard">대시보드로 이동</Link>
        </Button>
      </div>
    </div>
  );
}
