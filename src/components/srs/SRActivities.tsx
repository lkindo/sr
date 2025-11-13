"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface Activity {
  id: string;
  type: string;
  description: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

interface SRActivitiesProps {
  srId: string;
}

const activityTypeLabels: Record<string, string> = {
  CREATED: "생성",
  UPDATED: "수정",
  STATUS_CHANGE: "상태 변경",
  ASSIGNED: "담당자 지정",
  COMMENT: "댓글",
  ATTACHMENT: "첨부파일",
};

const activityTypeColors: Record<
  string,
  "default" | "secondary" | "destructive"
> = {
  CREATED: "default",
  UPDATED: "secondary",
  STATUS_CHANGE: "default",
  ASSIGNED: "default",
  COMMENT: "secondary",
  ATTACHMENT: "secondary",
};

export function SRActivities({ srId }: SRActivitiesProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchActivities = useCallback(async () => {
    try {
      const response = await fetch(`/api/srs/${srId}/activities`);
      if (!response.ok) throw new Error("Failed to fetch activities");
      const data = await response.json();
      setActivities(data);
    } catch (error) {
      toast({
        title: "오류",
        description: "활동 이력을 불러오는데 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [srId, toast]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">로딩 중...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>활동 이력 ({activities.length})</CardTitle>
        <CardDescription>
          이 SR의 모든 활동 이력을 시간순으로 확인할 수 있습니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            활동 이력이 없습니다.
          </p>
        ) : (
          <div className="relative space-y-4">
            <div className="absolute left-5 top-0 h-full w-px bg-border" />
            {activities.map((activity, index) => (
              <div key={activity.id} className="relative flex gap-4">
                <Avatar className="relative z-10">
                  <AvatarImage src="" alt={activity.user.name} />
                  <AvatarFallback>
                    {getInitials(activity.user.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-1 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {activity.user.name}
                    </span>
                    <Badge
                      variant={
                        activityTypeColors[activity.type] || "secondary"
                      }
                      className="text-xs"
                    >
                      {activityTypeLabels[activity.type] || activity.type}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(activity.createdAt).toLocaleString("ko-KR")}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {activity.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
