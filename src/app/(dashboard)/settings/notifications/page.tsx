"use client";

import { useState } from "react";
import { Bell, Mail, MessageSquare } from "lucide-react";
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

export default function NotificationsPage() {
  const { toast } = useToast();

  // 알림 설정 상태
  const [emailSRCreated, setEmailSRCreated] = useState(true);
  const [emailSRAssigned, setEmailSRAssigned] = useState(true);
  const [emailSRStatusChanged, setEmailSRStatusChanged] = useState(true);
  const [emailCommentAdded, setEmailCommentAdded] = useState(false);

  const [pushSRCreated, setPushSRCreated] = useState(true);
  const [pushSRAssigned, setPushSRAssigned] = useState(true);
  const [pushSRStatusChanged, setPushSRStatusChanged] = useState(false);
  const [pushCommentAdded, setPushCommentAdded] = useState(false);

  const handleSave = () => {
    // TODO: API 호출하여 알림 설정 저장
    toast({
      title: "성공",
      description: "알림 설정이 저장되었습니다.",
    });
  };

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
              checked={emailSRCreated}
              onCheckedChange={setEmailSRCreated}
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
              checked={emailSRAssigned}
              onCheckedChange={setEmailSRAssigned}
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
              checked={emailSRStatusChanged}
              onCheckedChange={setEmailSRStatusChanged}
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
              checked={emailCommentAdded}
              onCheckedChange={setEmailCommentAdded}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            <CardTitle>푸시 알림</CardTitle>
          </div>
          <CardDescription>
            브라우저 푸시 알림을 설정합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="push-sr-created">SR 생성</Label>
              <p className="text-sm text-muted-foreground">
                새로운 SR이 생성되었을 때
              </p>
            </div>
            <Switch
              id="push-sr-created"
              checked={pushSRCreated}
              onCheckedChange={setPushSRCreated}
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
              checked={pushSRAssigned}
              onCheckedChange={setPushSRAssigned}
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
              checked={pushSRStatusChanged}
              onCheckedChange={setPushSRStatusChanged}
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
              checked={pushCommentAdded}
              onCheckedChange={setPushCommentAdded}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave}>설정 저장</Button>
      </div>
    </div>
  );
}
