'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Bell, CheckCircle2, Loader2, Mail, XCircle } from 'lucide-react';

import { Button } from '@/components/ui';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { Label } from '@/components/ui';
import { Separator } from '@/components/ui';
import { Switch } from '@/components/ui';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiPut } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

interface NotificationPreferences {
  emailSRCreated: boolean;
  emailSRAssigned: boolean;
  emailSRStatusChanged: boolean;
  emailCommentAdded: boolean;
  pushSRCreated: boolean;
  pushSRAssigned: boolean;
  pushSRStatusChanged: boolean;
  pushCommentAdded: boolean;
}

/**
 * 서버 값이 없거나 조회가 실패했을 때 화면에 보일 값.
 *
 * 폼 초기값이자 조회 실패 시의 폴백이다 — 두 곳에서 같은 기본값을 써야 하므로 상수로 둔다.
 */
const DEFAULT_PREFERENCES: NotificationPreferences = {
  emailSRCreated: true,
  emailSRAssigned: true,
  emailSRStatusChanged: true,
  emailCommentAdded: false,
  pushSRCreated: true,
  pushSRAssigned: true,
  pushSRStatusChanged: false,
  pushCommentAdded: false,
};

export default function NotificationsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const {
    isSupported,
    isSubscribed,
    permission,
    isLoading: isPushLoading,
    error: pushError,
    subscribe,
    unsubscribe,
  } = usePushNotifications();

  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);

  // Load preferences from API
  //
  // ⚠️ **조회 실패는 의도적으로 조용하다.** 예전 `catch {}` 에 적혀 있던 "실패 시 기본값 유지"
  //    가 이 쿼리의 계약이다. 그래서 `error` 를 화면에도 토스트에도 내보내지 않는다 —
  //    실패하면 아래 폼은 DEFAULT_PREFERENCES 를 그대로 보여 준다.
  //
  // `retry: false` 인 이유: 이 화면의 로딩 스피너는 "조회가 끝날 때까지" 돈다(`isPending`).
  // 전역 기본값 `retry: 1` 을 그대로 두면 실패했을 때 백오프만큼 스피너가 더 돌다가 결국
  // 같은 기본값을 보여 준다 — 사용자를 기다리게 만들 뿐 결과가 달라지지 않는다.
  // 한 번 시도하고 곧장 기본값으로 넘어가던 예전 동작을 그대로 유지한다.
  const { data: serverPreferences, isPending: isLoadingPrefs } = useQuery({
    queryKey: qk.settings.notifications,
    queryFn: () => apiGet<Partial<NotificationPreferences>>('/api/settings/notifications'),
    retry: false,
  });

  // 서버 값이 도착하면 폼을 초기화한다.
  //
  // ⚠️ 여기서 `serverPreferences` 를 의존성에 넣고 조건 없이 setState 하면, 저장 후 무효화로
  //    일어나는 재조회가 사용자가 방금 만진 스위치를 되돌려 놓는다. ref 로 "최초 1회" 를
  //    못박아, 마운트 때 한 번만 읽던 예전 동작을 그대로 유지한다.
  const hasHydratedRef = useRef(false);
  useEffect(() => {
    if (!serverPreferences || hasHydratedRef.current) return;
    hasHydratedRef.current = true;
    // 서버가 일부 키를 빠뜨리면 그 키만 기본값으로 남긴다(예전 `data.x ?? 기본값` 과 동일).
    setPreferences((defaults) => ({
      emailSRCreated: serverPreferences.emailSRCreated ?? defaults.emailSRCreated,
      emailSRAssigned: serverPreferences.emailSRAssigned ?? defaults.emailSRAssigned,
      emailSRStatusChanged: serverPreferences.emailSRStatusChanged ?? defaults.emailSRStatusChanged,
      emailCommentAdded: serverPreferences.emailCommentAdded ?? defaults.emailCommentAdded,
      pushSRCreated: serverPreferences.pushSRCreated ?? defaults.pushSRCreated,
      pushSRAssigned: serverPreferences.pushSRAssigned ?? defaults.pushSRAssigned,
      pushSRStatusChanged: serverPreferences.pushSRStatusChanged ?? defaults.pushSRStatusChanged,
      pushCommentAdded: serverPreferences.pushCommentAdded ?? defaults.pushCommentAdded,
    }));
  }, [serverPreferences]);

  // Handle preference change
  const handlePreferenceChange = (key: keyof NotificationPreferences, value: boolean) => {
    setPreferences((prev) => ({ ...prev, [key]: value }));
  };

  // Save preferences
  //
  // 실패 문구는 서버 메시지가 아니라 고정 문구다 — 400('잘못된 설정 데이터입니다.')이든
  // 500이든 사용자에게는 같은 안내를 보여 주던 기존 동작을 유지한다.
  const { mutate: savePreferences, isPending: isSaving } = useMutation({
    mutationFn: (next: NotificationPreferences) =>
      apiPut<{ message: string; preferences: unknown }>('/api/settings/notifications', next),
    onError: () => {
      toast({
        title: '오류',
        description: '알림 설정 저장에 실패했습니다.',
        variant: 'destructive',
      });
    },
    onSuccess: () => {
      toast({
        title: '성공',
        description: '알림 설정이 저장되었습니다.',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: qk.settings.notifications });
    },
  });

  const handleSave = () => savePreferences(preferences);

  // Handle push subscription toggle
  const handlePushToggle = async () => {
    if (isSubscribed) {
      const success = await unsubscribe();
      if (success) {
        toast({
          title: '푸시 알림 비활성화',
          description: '푸시 알림이 비활성화되었습니다.',
        });
      }
    } else {
      const success = await subscribe();
      if (success) {
        toast({
          title: '푸시 알림 활성화',
          description: '푸시 알림이 활성화되었습니다.',
        });
      } else if (permission === 'denied') {
        toast({
          title: '권한 거부됨',
          description: '브라우저 설정에서 알림 권한을 허용해주세요.',
          variant: 'destructive',
        });
      }
    }
  };

  // Render push status badge
  const renderPushStatusBadge = () => {
    if (!isSupported) {
      return (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <XCircle className="h-4 w-4" />
          <span>지원되지 않음</span>
        </div>
      );
    }

    if (isPushLoading) {
      return (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>확인 중...</span>
        </div>
      );
    }

    if (permission === 'denied') {
      return (
        <div className="flex items-center gap-1.5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span>권한 거부됨</span>
        </div>
      );
    }

    if (isSubscribed) {
      return (
        <div className="flex items-center gap-1.5 text-sm text-green-600">
          <CheckCircle2 className="h-4 w-4" />
          <span>활성화됨</span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <XCircle className="h-4 w-4" />
        <span>비활성화됨</span>
      </div>
    );
  };

  if (isLoadingPrefs) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">알림 설정</h1>
        <p className="text-muted-foreground">이메일 및 푸시 알림을 관리합니다.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            <CardTitle>이메일 알림</CardTitle>
          </div>
          <CardDescription>SR 관련 이벤트에 대한 이메일 알림을 설정합니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="email-sr-created">SR 생성</Label>
              <p className="text-sm text-muted-foreground">새로운 SR이 생성되었을 때</p>
            </div>
            <Switch
              id="email-sr-created"
              checked={preferences.emailSRCreated}
              onCheckedChange={(v) => handlePreferenceChange('emailSRCreated', v)}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="email-sr-assigned">SR 배정</Label>
              <p className="text-sm text-muted-foreground">SR이 나에게 배정되었을 때</p>
            </div>
            <Switch
              id="email-sr-assigned"
              checked={preferences.emailSRAssigned}
              onCheckedChange={(v) => handlePreferenceChange('emailSRAssigned', v)}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="email-sr-status">상태 변경</Label>
              <p className="text-sm text-muted-foreground">SR 상태가 변경되었을 때</p>
            </div>
            <Switch
              id="email-sr-status"
              checked={preferences.emailSRStatusChanged}
              onCheckedChange={(v) => handlePreferenceChange('emailSRStatusChanged', v)}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="email-comment">댓글 추가</Label>
              <p className="text-sm text-muted-foreground">SR에 새로운 댓글이 추가되었을 때</p>
            </div>
            <Switch
              id="email-comment"
              checked={preferences.emailCommentAdded}
              onCheckedChange={(v) => handlePreferenceChange('emailCommentAdded', v)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              <CardTitle>푸시 알림</CardTitle>
            </div>
            {renderPushStatusBadge()}
          </div>
          <CardDescription>브라우저 푸시 알림을 설정합니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Push subscription toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label className="text-base font-medium">푸시 알림 활성화</Label>
              <p className="text-sm text-muted-foreground">
                {isSubscribed
                  ? '현재 이 브라우저에서 푸시 알림을 받고 있습니다.'
                  : '푸시 알림을 활성화하면 브라우저로 실시간 알림을 받을 수 있습니다.'}
              </p>
              {pushError && <p className="text-sm text-destructive">{pushError}</p>}
            </div>
            <Button
              variant={isSubscribed ? 'outline' : 'default'}
              onClick={handlePushToggle}
              disabled={!isSupported || isPushLoading}
            >
              {isPushLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isSubscribed ? (
                '비활성화'
              ) : (
                '활성화'
              )}
            </Button>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="push-sr-created">SR 생성</Label>
              <p className="text-sm text-muted-foreground">새로운 SR이 생성되었을 때</p>
            </div>
            <Switch
              id="push-sr-created"
              checked={preferences.pushSRCreated}
              onCheckedChange={(v) => handlePreferenceChange('pushSRCreated', v)}
              disabled={!isSubscribed}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="push-sr-assigned">SR 배정</Label>
              <p className="text-sm text-muted-foreground">SR이 나에게 배정되었을 때</p>
            </div>
            <Switch
              id="push-sr-assigned"
              checked={preferences.pushSRAssigned}
              onCheckedChange={(v) => handlePreferenceChange('pushSRAssigned', v)}
              disabled={!isSubscribed}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="push-sr-status">상태 변경</Label>
              <p className="text-sm text-muted-foreground">SR 상태가 변경되었을 때</p>
            </div>
            <Switch
              id="push-sr-status"
              checked={preferences.pushSRStatusChanged}
              onCheckedChange={(v) => handlePreferenceChange('pushSRStatusChanged', v)}
              disabled={!isSubscribed}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="push-comment">댓글 추가</Label>
              <p className="text-sm text-muted-foreground">SR에 새로운 댓글이 추가되었을 때</p>
            </div>
            <Switch
              id="push-comment"
              checked={preferences.pushCommentAdded}
              onCheckedChange={(v) => handlePreferenceChange('pushCommentAdded', v)}
              disabled={!isSubscribed}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              저장 중...
            </>
          ) : (
            '설정 저장'
          )}
        </Button>
      </div>
    </div>
  );
}
