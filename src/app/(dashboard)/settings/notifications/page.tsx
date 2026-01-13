"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, Mail, Loader2, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { usePushNotifications } from "@/hooks/use-push-notifications";

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

export default function NotificationsPage() {
  const { toast } = useToast();
  const {
    isSupported,
    isSubscribed,
    permission,
    isLoading: isPushLoading,
    error: pushError,
    subscribe,
    unsubscribe,
  } = usePushNotifications();

  const [isLoadingPrefs, setIsLoadingPrefs] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    emailSRCreated: true,
    emailSRAssigned: true,
    emailSRStatusChanged: true,
    emailCommentAdded: false,
    pushSRCreated: true,
    pushSRAssigned: true,
    pushSRStatusChanged: false,
    pushCommentAdded: false,
  });

  // Load preferences from API
  const loadPreferences = useCallback(async () => {
    try {
      const response = await fetch("/api/settings/notifications");
      if (response.ok) {
        const data = await response.json();
        setPreferences({
          emailSRCreated: data.emailSRCreated ?? true,
          emailSRAssigned: data.emailSRAssigned ?? true,
          emailSRStatusChanged: data.emailSRStatusChanged ?? true,
          emailCommentAdded: data.emailCommentAdded ?? false,
          pushSRCreated: data.pushSRCreated ?? true,
          pushSRAssigned: data.pushSRAssigned ?? true,
          pushSRStatusChanged: data.pushSRStatusChanged ?? false,
          pushCommentAdded: data.pushCommentAdded ?? false,
        });
      }
    } catch {
      // 실패 시 기본값 유지
    } finally {
      setIsLoadingPrefs(false);
    }
  }, []);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  // Handle preference change
  const handlePreferenceChange = (key: keyof NotificationPreferences, value: boolean) => {
    setPreferences((prev) => ({ ...prev, [key]: value }));
  };

  // Save preferences
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/settings/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preferences),
      });

      if (response.ok) {
        toast({
          title: "성공",
          description: "알림 설정이 저장되었습니다.",
        });
      } else {
        throw new Error("Failed to save preferences");
      }
    } catch {
      toast({
        title: "오류",
        description: "알림 설정 저장에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle push subscription toggle
  const handlePushToggle = async () => {
    if (isSubscribed) {
      const success = await unsubscribe();
      if (success) {
        toast({
          title: "푸시 알림 비활성화",
          description: "푸시 알림이 비활성화되었습니다.",
        });
      }
    } else {
      const success = await subscribe();
      if (success) {
        toast({
          title: "푸시 알림 활성화",
          description: "푸시 알림이 활성화되었습니다.",
        });
      } else if (permission === "denied") {
        toast({
          title: "권한 거부됨",
          description: "브라우저 설정에서 알림 권한을 허용해주세요.",
          variant: "destructive",
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

    if (permission === "denied") {
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
        <p className="text-muted-foreground">
          이메일 및 푸시 알림을 관리합니다.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            <CardTitle>이메일 알림</CardTitle>
          </div>
          <CardDescription>
            SR 관련 이벤트에 대한 이메일 알림을 설정합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="email-sr-created">SR 생성</Label>
              <p className="text-sm text-muted-foreground">
                새로운 SR이 생성되었을 때
              </p>
            </div>
            <Switch
              id="email-sr-created"
              checked={preferences.emailSRCreated}
              onCheckedChange={(v) => handlePreferenceChange("emailSRCreated", v)}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="email-sr-assigned">SR 배정</Label>
              <p className="text-sm text-muted-foreground">
                SR이 나에게 배정되었을 때
              </p>
            </div>
            <Switch
              id="email-sr-assigned"
              checked={preferences.emailSRAssigned}
              onCheckedChange={(v) => handlePreferenceChange("emailSRAssigned", v)}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="email-sr-status">상태 변경</Label>
              <p className="text-sm text-muted-foreground">
                SR 상태가 변경되었을 때
              </p>
            </div>
            <Switch
              id="email-sr-status"
              checked={preferences.emailSRStatusChanged}
              onCheckedChange={(v) => handlePreferenceChange("emailSRStatusChanged", v)}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="email-comment">댓글 추가</Label>
              <p className="text-sm text-muted-foreground">
                SR에 새로운 댓글이 추가되었을 때
              </p>
            </div>
            <Switch
              id="email-comment"
              checked={preferences.emailCommentAdded}
              onCheckedChange={(v) => handlePreferenceChange("emailCommentAdded", v)}
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
          <CardDescription>
            브라우저 푸시 알림을 설정합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Push subscription toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label className="text-base font-medium">푸시 알림 활성화</Label>
              <p className="text-sm text-muted-foreground">
                {isSubscribed
                  ? "현재 이 브라우저에서 푸시 알림을 받고 있습니다."
                  : "푸시 알림을 활성화하면 브라우저로 실시간 알림을 받을 수 있습니다."}
              </p>
              {pushError && (
                <p className="text-sm text-destructive">{pushError}</p>
              )}
            </div>
            <Button
              variant={isSubscribed ? "outline" : "default"}
              onClick={handlePushToggle}
              disabled={!isSupported || isPushLoading}
            >
              {isPushLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isSubscribed ? (
                "비활성화"
              ) : (
                "활성화"
              )}
            </Button>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="push-sr-created">SR 생성</Label>
              <p className="text-sm text-muted-foreground">
                새로운 SR이 생성되었을 때
              </p>
            </div>
            <Switch
              id="push-sr-created"
              checked={preferences.pushSRCreated}
              onCheckedChange={(v) => handlePreferenceChange("pushSRCreated", v)}
              disabled={!isSubscribed}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="push-sr-assigned">SR 배정</Label>
              <p className="text-sm text-muted-foreground">
                SR이 나에게 배정되었을 때
              </p>
            </div>
            <Switch
              id="push-sr-assigned"
              checked={preferences.pushSRAssigned}
              onCheckedChange={(v) => handlePreferenceChange("pushSRAssigned", v)}
              disabled={!isSubscribed}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="push-sr-status">상태 변경</Label>
              <p className="text-sm text-muted-foreground">
                SR 상태가 변경되었을 때
              </p>
            </div>
            <Switch
              id="push-sr-status"
              checked={preferences.pushSRStatusChanged}
              onCheckedChange={(v) => handlePreferenceChange("pushSRStatusChanged", v)}
              disabled={!isSubscribed}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="push-comment">댓글 추가</Label>
              <p className="text-sm text-muted-foreground">
                SR에 새로운 댓글이 추가되었을 때
              </p>
            </div>
            <Switch
              id="push-comment"
              checked={preferences.pushCommentAdded}
              onCheckedChange={(v) => handlePreferenceChange("pushCommentAdded", v)}
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
            "설정 저장"
          )}
        </Button>
      </div>
    </div>
  );
}
