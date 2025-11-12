"use client";

import { useState, useEffect } from "react";
import { Clock, Filter, TrendingUp, User, Calendar } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";

interface IntakeQueueSR {
  id: string;
  srNumber: string;
  title: string;
  description: string;
  requestedPriority: string;
  requestedCompletionDate?: string | null;
  requestedAt: string;
  waitingMinutes: number;
  waitingHours: number;
  priorityScore: number;
  client: {
    id: string;
    code: string;
    name: string;
  };
  serviceCategory: {
    id: string;
    categoryName: string;
    slaHours: number;
    priority: string;
    handler?: {
      id: string;
      name: string;
    } | null;
  };
  requester: {
    id: string;
    name: string;
    email: string;
  };
  recommendedAssignee?: {
    id: string;
    name: string;
  } | null;
  slaHours: number;
  _count: {
    comments: number;
    attachments: number;
  };
}

const priorityLabels: Record<string, string> = {
  CRITICAL: "긴급",
  HIGH: "높음",
  MEDIUM: "보통",
  LOW: "낮음",
};

const priorityColors: Record<string, "default" | "secondary" | "destructive"> = {
  CRITICAL: "destructive",
  HIGH: "destructive",
  MEDIUM: "default",
  LOW: "secondary",
};

export default function IntakeQueuePage() {
  const [srs, setSrs] = useState<IntakeQueueSR[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("priority");
  const { toast } = useToast();

  const fetchIntakeQueue = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (clientFilter !== "all") params.append("clientId", clientFilter);
      if (categoryFilter !== "all") params.append("serviceCategoryId", categoryFilter);
      params.append("sortBy", sortBy);

      const response = await fetch(`/api/srs/intake-queue?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch intake queue");

      const data = await response.json();
      setSrs(data.srs || []);
    } catch (error) {
      console.error("Error fetching intake queue:", error);
      toast({
        title: "오류",
        description: "접수 대기 목록을 불러오는데 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntakeQueue();
  }, [clientFilter, categoryFilter, sortBy]);

  // 고유 고객사 및 카테고리 목록
  const uniqueClients = Array.from(
    new Set(srs.map((sr) => JSON.stringify({ id: sr.client.id, name: sr.client.name })))
  ).map((str) => JSON.parse(str));

  const uniqueCategories = Array.from(
    new Set(
      srs.map((sr) =>
        JSON.stringify({ id: sr.serviceCategory.id, name: sr.serviceCategory.categoryName })
      )
    )
  ).map((str) => JSON.parse(str));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">SR 접수 대기 큐</h1>
          <p className="text-muted-foreground">
            접수 대기 중인 SR을 검토하고 접수 처리합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-lg px-3 py-1">
            대기: {srs.length}건
          </Badge>
        </div>
      </div>

      {/* 필터 영역 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            필터 및 정렬
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">고객사</label>
              <Select value={clientFilter} onValueChange={setClientFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="전체 고객사" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 고객사</SelectItem>
                  {uniqueClients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">서비스 카테고리</label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="전체 카테고리" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 카테고리</SelectItem>
                  {uniqueCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">정렬 기준</label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="priority">우선순위 점수</SelectItem>
                  <SelectItem value="waitingTime">대기 시간</SelectItem>
                  <SelectItem value="requestedCompletionDate">희망 완료일</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SR 목록 */}
      <div className="space-y-4">
        {srs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">접수 대기 중인 SR이 없습니다.</p>
            </CardContent>
          </Card>
        ) : (
          srs.map((sr) => (
            <Card key={sr.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/srs/${sr.id}/intake`}
                        className="text-xl font-semibold hover:underline"
                      >
                        {sr.srNumber}
                      </Link>
                      <Badge variant={priorityColors[sr.requestedPriority]}>
                        희망: {priorityLabels[sr.requestedPriority]}
                      </Badge>
                      {sr.priorityScore >= 80 && (
                        <Badge variant="destructive" className="animate-pulse">
                          긴급 처리 필요
                        </Badge>
                      )}
                    </div>
                    <p className="text-lg font-medium">{sr.title}</p>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {sr.description}
                    </p>
                  </div>

                  <div className="text-right space-y-1">
                    <div className="text-2xl font-bold text-primary">
                      {sr.priorityScore}점
                    </div>
                    <p className="text-xs text-muted-foreground">우선순위 점수</p>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* 고객사 및 카테고리 */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">고객사:</span>
                      <span className="font-medium">{sr.client.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">카테고리:</span>
                      <span className="font-medium">{sr.serviceCategory.categoryName}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">요청자:</span>
                      <span>{sr.requester.name}</span>
                    </div>
                  </div>

                  {/* 대기 시간 */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">대기 시간</span>
                    </div>
                    <div className="text-2xl font-bold text-orange-600">
                      {sr.waitingHours.toFixed(1)}시간
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(sr.requestedAt), {
                        addSuffix: true,
                        locale: ko,
                      })}
                    </p>
                  </div>

                  {/* SLA 및 희망 완료일 */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">SLA / 희망일</span>
                    </div>
                    <div className="text-sm">
                      <div>SLA: {sr.slaHours}시간</div>
                      {sr.requestedCompletionDate && (
                        <div className="text-primary font-medium">
                          희망:{" "}
                          {new Date(sr.requestedCompletionDate).toLocaleDateString("ko-KR")}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 추천 담당자 및 액션 */}
                  <div className="space-y-2">
                    {sr.recommendedAssignee && (
                      <div className="flex items-center gap-2 text-sm">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">추천:</span>
                        <span className="font-medium">{sr.recommendedAssignee.name}</span>
                      </div>
                    )}
                    <Link href={`/srs/${sr.id}/intake`}>
                      <Button className="w-full" size="lg">
                        접수하기
                      </Button>
                    </Link>
                  </div>
                </div>

                {/* 첨부파일 및 댓글 */}
                {(sr._count.attachments > 0 || sr._count.comments > 0) && (
                  <div className="mt-4 pt-4 border-t flex gap-4 text-sm text-muted-foreground">
                    {sr._count.attachments > 0 && (
                      <span>📎 첨부파일 {sr._count.attachments}개</span>
                    )}
                    {sr._count.comments > 0 && (
                      <span>💬 댓글 {sr._count.comments}개</span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
