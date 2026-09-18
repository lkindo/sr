'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Database, Lock, Mail } from 'lucide-react';

import { Badge } from '@/components/ui';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { Separator } from '@/components/ui';
import { useToast } from '@/hooks/use-toast';
import { apiGet, retryUnlessClientError } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { qk } from '@/lib/query-keys';
import type { SystemSettings } from '@/types/settings';

/**
 * 시스템 설정 — **실제로 적용 중인 값을 보여 주는 읽기 전용 화면**.
 *
 * 예전 화면은 사이트 이름·설명·관리자 이메일을 입력받아 "설정 저장" 을 보냈지만 서버는 아무것도
 * 저장하지 않고 성공을 돌려줬다. "지금 백업"·"캐시 삭제" 버튼에는 클릭 핸들러가 없었고,
 * "마지막 백업: 2025-01-12 10:30", "세션 24시간", "최소 6자" 는 여기 박힌 값이었다. 설정을 저장할
 * 곳(테이블)이 없으므로 조작은 걷어내고, 서버가 각 값의 정본에서 읽어 준 것만 보여 준다.
 *
 * 예외는 백업 카드 하나다. 백업 일정은 앱이 아니라 `.github/workflows/backup.yml`(cron) 에 있어
 * 서버가 읽어 줄 수 없으므로 문구로 적었다 — 일정을 바꾸면 이 문구도 함께 고친다.
 */
export default function SystemSettingsPage() {
  const { toast } = useToast();

  // `/api/settings/system` 은 `{data, meta}` 봉투 없이 객체를 그대로 주므로 apiGet 을 쓴다.
  const {
    data: settings,
    isPending,
    error,
  } = useQuery({
    queryKey: qk.settings.system,
    queryFn: () => apiGet<SystemSettings>('/api/settings/system'),
    retry: retryUnlessClientError,
  });

  // 조회 실패는 화면에 노출하지 않는다 — 로그 + 토스트로만 알린다.
  // (v5 의 useQuery 에는 onError 가 없어 effect 로 옮겼다.)
  useEffect(() => {
    if (!error) return;
    logger.error('시스템 설정 조회 오류', error instanceof Error ? error : undefined);
    toast({
      title: '오류',
      description: '시스템 설정을 불러오는데 실패했습니다.',
      variant: 'destructive',
    });
  }, [error, toast]);

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">로딩 중...</p>
      </div>
    );
  }

  const mail = settings?.mailServer;
  const session = settings?.session;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">시스템 설정</h1>
        <p className="text-muted-foreground">
          현재 적용 중인 설정입니다. 값은 코드와 서버 환경 변수로 관리하며 이 화면에서 바꿀 수
          없습니다.
        </p>
        <Badge variant="destructive" className="mt-2">
          ADMIN 전용
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            <CardTitle>보안</CardTitle>
          </div>
          <CardDescription>인증과 계정 보안 정책</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium">자동 로그아웃</p>
            <p className="text-sm text-muted-foreground">
              {session
                ? `입력이 ${session.idleLogoutMinutes}분간 없으면 로그아웃(${session.idleWarningMinutes}분 전에 경고)`
                : '-'}
            </p>
          </div>
          <Separator />
          <div>
            <p className="text-sm font-medium">로그인 유지 시간</p>
            <p className="text-sm text-muted-foreground">
              {session
                ? `마지막 사용 후 ${session.tokenMaxAgeHours}시간 · 로그인 후 최대 ${session.absoluteMaxAgeHours}시간`
                : '-'}
            </p>
            <p className="text-xs text-muted-foreground">
              화면을 닫아 두어 자동 로그아웃 타이머가 돌지 않을 때는 마지막 사용 후 첫 번째 시간이
              지나면 로그아웃됩니다. 계속 사용 중이어도 로그인한 지 두 번째 시간이 지나면 다시
              로그인해야 합니다.
            </p>
          </div>
          <Separator />
          <div>
            <p className="text-sm font-medium">로그인 실패 잠금</p>
            <p className="text-sm text-muted-foreground">
              {settings?.loginLock
                ? `${settings.loginLock.windowMinutes}분 안에 ${settings.loginLock.maxFailures}번 틀리면 ${settings.loginLock.lockMinutes}분 동안 로그인 거부`
                : '-'}
            </p>
            <p className="text-xs text-muted-foreground">
              접속 위치(IP)와 관계없이 계정(이메일) 단위로 셉니다. 시간이 지나면 자동으로 풀립니다.
            </p>
          </div>
          <Separator />
          <div>
            <p className="text-sm font-medium">비밀번호 정책</p>
            <p className="text-sm text-muted-foreground">{settings?.passwordPolicy ?? '-'}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            <CardTitle>메일 발송</CardTitle>
          </div>
          <CardDescription>알림 메일을 보내는 SMTP 서버</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm font-medium">{mail ? `${mail.host}:${mail.port}` : '-'}</p>
          {mail && !mail.configured && (
            <p className="text-xs text-muted-foreground">
              EMAIL_SERVER_HOST 가 설정되지 않아 기본값을 씁니다. 서버 환경 변수를 확인하세요.
            </p>
          )}
          {mail && !mail.credentialsConfigured && (
            <p className="text-xs text-destructive">
              발송 계정(EMAIL_SERVER_USER/PASSWORD)이 설정되지 않아 알림 메일이 발송되지 않습니다.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            <CardTitle>데이터베이스 백업</CardTitle>
          </div>
          <CardDescription>백업은 서버에서 자동으로 실행됩니다</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            매일 03:00(KST) 자동 백업. 실행 결과는 GitHub Actions 의 Scheduled Backup 워크플로에서
            확인합니다(docs/backup-and-restore.md).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
