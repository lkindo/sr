'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, Lock, Mail, Settings } from 'lucide-react';

import { Badge } from '@/components/ui';
import { Button } from '@/components/ui';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { Input } from '@/components/ui';
import { Label } from '@/components/ui';
import { Separator } from '@/components/ui';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiPut, retryUnlessClientError } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { qk } from '@/lib/query-keys';
import type { SystemSettings } from '@/types/settings';

export default function SystemSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // 시스템 설정 가져오기.
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

  /**
   * 사용자가 고친 값만 담는 초안.
   *
   * 예전에는 useEffect 안에서 응답을 그대로 setState 로 밀어 넣었지만, 이제 서버 값은
   * 쿼리 캐시가 들고 있으므로 **바뀐 필드만** 여기에 두고 나머지는 캐시에서 읽는다.
   * 이렇게 하면
   *   - 로딩이 끝난 첫 프레임부터 서버 값이 그려진다(동기화 effect 가 한 박자 늦게
   *     돌면서 입력칸이 잠깐 비어 보이는 일이 없다),
   *   - 저장 후 무효화로 재조회가 일어나도 사용자가 입력하던 값이 되돌아가지 않는다.
   * 빈 문자열도 "사용자가 지운 값" 이므로 `??` 로 판별한다(`||` 를 쓰면 안 된다).
   */
  const [draft, setDraft] = useState<
    Pick<SystemSettings, 'siteName' | 'siteDescription' | 'adminEmail'>
  >({});

  const siteName = draft.siteName ?? settings?.siteName ?? '';
  const siteDescription = draft.siteDescription ?? settings?.siteDescription ?? '';
  const adminEmail = draft.adminEmail ?? settings?.adminEmail ?? '';

  // 조회 실패는 화면에 노출하지 않는다 — 기존과 동일하게 로그 + 토스트로만 알리고
  // 폼은 빈 값으로 그린다. (v5 의 useQuery 에는 onError 가 없어 effect 로 옮겼다.)
  useEffect(() => {
    if (!error) return;
    logger.error('시스템 설정 조회 오류', error instanceof Error ? error : undefined);
    toast({
      title: '오류',
      description: '시스템 설정을 불러오는데 실패했습니다.',
      variant: 'destructive',
    });
  }, [error, toast]);

  const saveMutation = useMutation({
    mutationFn: (payload: SystemSettings) =>
      apiPut<{ message: string }>('/api/settings/system', payload, {
        fallbackMessage: '시스템 설정 저장에 실패했습니다.',
      }),
    onError: (saveError) => {
      toast({
        title: '오류',
        description:
          saveError instanceof Error ? saveError.message : '시스템 설정 저장에 실패했습니다.',
        variant: 'destructive',
      });
    },
    onSuccess: () => {
      toast({
        title: '성공',
        description: '시스템 설정이 저장되었습니다.',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: qk.settings.system });
    },
  });

  const saving = saveMutation.isPending;

  const handleSave = () => {
    saveMutation.mutate({ siteName, siteDescription, adminEmail });
  };

  // 첫 로딩만 스피너를 띄운다. `isFetching` 을 쓰면 재조회마다 폼이 사라진다.
  if (isPending) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">시스템 설정</h1>
        <p className="text-muted-foreground">시스템 전반의 설정을 관리합니다.</p>
        <Badge variant="destructive" className="mt-2">
          ADMIN 전용
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            <CardTitle>일반 설정</CardTitle>
          </div>
          <CardDescription>사이트 기본 정보를 설정합니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="site-name">사이트 이름</Label>
            <Input
              id="site-name"
              value={siteName}
              onChange={(e) => setDraft((prev) => ({ ...prev, siteName: e.target.value }))}
              placeholder="사이트 이름"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="site-description">사이트 설명</Label>
            <Input
              id="site-description"
              value={siteDescription}
              onChange={(e) => setDraft((prev) => ({ ...prev, siteDescription: e.target.value }))}
              placeholder="사이트 설명"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="admin-email">관리자 이메일</Label>
            <Input
              id="admin-email"
              type="email"
              value={adminEmail}
              onChange={(e) => setDraft((prev) => ({ ...prev, adminEmail: e.target.value }))}
              placeholder="admin@example.com"
            />
            <p className="text-xs text-muted-foreground">
              시스템 알림을 받을 관리자 이메일 주소입니다.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            <CardTitle>데이터베이스</CardTitle>
          </div>
          <CardDescription>데이터베이스 상태 및 관리</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">데이터베이스 백업</p>
              <p className="text-sm text-muted-foreground">마지막 백업: 2025-01-12 10:30</p>
            </div>
            <Button variant="outline">지금 백업</Button>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">캐시 초기화</p>
              <p className="text-sm text-muted-foreground">시스템 캐시를 초기화합니다.</p>
            </div>
            <Button variant="outline">캐시 삭제</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            <CardTitle>이메일 설정</CardTitle>
          </div>
          <CardDescription>SMTP 서버 설정</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="smtp-host">SMTP 호스트</Label>
            <Input id="smtp-host" placeholder="smtp.example.com" disabled />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="smtp-port">포트</Label>
              <Input id="smtp-port" placeholder="587" disabled />
            </div>

            <div className="space-y-2">
              <Label htmlFor="smtp-security">보안</Label>
              <Input id="smtp-security" value="TLS" disabled />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">이메일 설정은 환경 변수에서 관리됩니다.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            <CardTitle>보안 설정</CardTitle>
          </div>
          <CardDescription>인증 및 보안 관련 설정</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">세션 타임아웃</p>
              <p className="text-sm text-muted-foreground">현재: 24시간</p>
            </div>
            <Button variant="outline" disabled>
              변경
            </Button>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">비밀번호 정책</p>
              <p className="text-sm text-muted-foreground">최소 6자, 영문/숫자 조합</p>
            </div>
            <Button variant="outline" disabled>
              변경
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? '저장 중...' : '설정 저장'}
        </Button>
      </div>
    </div>
  );
}
