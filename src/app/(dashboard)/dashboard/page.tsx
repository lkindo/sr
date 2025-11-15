"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { FileText, Clock, CheckCircle, AlertCircle, ClipboardList, ArrowRight, AlertTriangle, TrendingUp, User, Target } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { Progress } from "@/components/ui/progress";
import { useRouter } from "next/navigation";

interface DashboardStats {
  summary: {
    total: number;
    inProgress: number;
    completed: number;
    pending: number;
    requested: number;
    urgent: number;
    myAssigned: number;
    myAssignedInProgress: number;
  };
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  byClient: Array<{
    clientId: string;
    clientName: string;
    clientCode: string;
    count: number;
  }>;
  recentSRs: Array<{
    id: string;
    srNumber: string;
    title: string;
    status: string;
    priority: string;
    createdAt: string;
    client: {
      name: string;
      code: string;
    };
    requester: {
      name: string;
    };
    assignedTo?: {
      name: string;
      id: string;
    } | null;
  }>;
  waitingSRs: Array<{
    id: string;
    srNumber: string;
    title: string;
    priority: string;
    requestedPriority: string;
    createdAt: string;
    client: {
      name: string;
      code: string;
    };
    requester: {
      name: string;
    };
    serviceCategory: {
      categoryName: string;
      priority: string | null;
    } | null;
  }>;
  myAssignedSRs: Array<{
    id: string;
    srNumber: string;
    title: string;
    status: string;
    priority: string;
    dueDate: string | null;
    createdAt: string;
    client: {
      name: string;
      code: string;
    };
    requester: {
      name: string;
    };
    serviceCategory: {
      categoryName: string;
    } | null;
  }>;
  performance: {
    avgProcessingHours: number;
    slaComplianceRate: number;
    avgWaitingHours: number;
  };
  trend: Array<{
    date: string;
    count: number;
  }>;
}

const statusLabels: Record<string, string> = {
  REQUESTED: "요청됨",
  INTAKE: "접수",
  IN_PROGRESS: "진행중",
  ON_HOLD: "대기",
  COMPLETED: "완료",
  CONFIRMED: "확인완료",
  REJECTED: "거부",
};

const priorityLabels: Record<string, string> = {
  CRITICAL: "긴급",
  HIGH: "높음",
  MEDIUM: "보통",
  LOW: "낮음",
};

const statusColors: Record<string, "default" | "secondary" | "destructive"> = {
  REQUESTED: "secondary",
  INTAKE: "default",
  IN_PROGRESS: "default",
  ON_HOLD: "secondary",
  COMPLETED: "default",
  CONFIRMED: "default",
  REJECTED: "destructive",
};

const priorityColors: Record<string, "default" | "secondary" | "destructive"> =
  {
    CRITICAL: "destructive",
    HIGH: "destructive",
    MEDIUM: "default",
    LOW: "secondary",
  };

const STATUS_CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#6b7280", "#8b5cf6", "#ec4899"];
const PRIORITY_CHART_COLORS = ["#ef4444", "#f59e0b", "#3b82f6", "#6b7280"];

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { hasAnyRole } = usePermissions();
  const router = useRouter();
  
  const isAdminManagerEngineer = hasAnyRole(["ADMIN", "MANAGER", "ENGINEER"]);
  const isEngineer = hasAnyRole(["ENGINEER"]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard/stats");
      if (!response.ok) throw new Error("Failed to fetch stats");
      const data = await response.json();
      setStats(data);
    } catch (error) {
      toast({
        title: "오류",
        description: "대시보드 통계를 불러오는데 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">로딩 중...</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">통계를 불러올 수 없습니다.</p>
      </div>
    );
  }

  // Prepare chart data
  const statusChartData = Object.entries(stats.byStatus).map(
    ([status, count]) => ({
      name: statusLabels[status] || status,
      value: count,
    })
  );

  const priorityChartData = Object.entries(stats.byPriority).map(
    ([priority, count]) => ({
      name: priorityLabels[priority] || priority,
      value: count,
    })
  );

  // 접수 대기 시간 포맷팅
  const formatWaitingTime = (hours: number): string => {
    if (hours < 1) return `${Math.round(hours * 60)}분`;
    if (hours < 24) return `${Math.round(hours)}시간`;
    return `${Math.round(hours / 24)}일`;
  };

  // 마감일까지 남은 시간 계산
  const getDaysUntilDue = (dueDate: string | null): number | null => {
    if (!dueDate) return null;
    const now = new Date();
    const due = new Date(dueDate);
    const diffTime = due.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <div className="sr-content-area space-y-6">
      {/* 접수 대기 SR 강조 카드 (ADMIN/MANAGER/ENGINEER만) */}
      {isAdminManagerEngineer && stats.summary.requested > 0 && (
        <Card className="sr-card border-l-4 border-l-[hsl(var(--sr-accent-orange))] bg-gradient-to-r from-orange-50/50 to-transparent dark:from-orange-950/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-6 w-6 text-[hsl(var(--sr-accent-orange))]" />
                <div>
                  <CardTitle className="text-lg font-semibold">접수 대기 SR</CardTitle>
                  <CardDescription className="mt-1">
                    {stats.summary.requested}개의 SR이 접수를 기다리고 있습니다
                  </CardDescription>
                </div>
              </div>
              <Button
                variant="default"
                className="bg-[hsl(var(--sr-accent-orange))] hover:bg-[hsl(var(--sr-accent-orange))]/90"
                onClick={() => router.push("/srs?status=REQUESTED")}
              >
                접수하기
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          {stats.waitingSRs.length > 0 && (
            <CardContent>
              <div className="space-y-2 mt-4">
                {stats.waitingSRs.slice(0, 3).map((sr) => {
                  const waitingHours = (new Date().getTime() - new Date(sr.createdAt).getTime()) / (1000 * 60 * 60);
                  return (
                    <Link
                      key={sr.id}
                      href={`/srs/${sr.id}/intake`}
                      className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{sr.srNumber}</span>
                          <Badge variant={priorityColors[sr.priority] || "default"} className="text-xs">
                            {priorityLabels[sr.priority] || sr.priority}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 truncate">{sr.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {sr.client.name} • {sr.requester.name} • 대기: {formatWaitingTime(waitingHours)}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground ml-2" />
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* 내 담당 SR 섹션 (ENGINEER용) */}
      {isEngineer && stats.summary.myAssigned > 0 && (
        <Card className="sr-card border-l-4 border-l-blue-500">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <User className="h-6 w-6 text-blue-600" />
                <div>
                  <CardTitle className="text-lg font-semibold">내 담당 SR</CardTitle>
                  <CardDescription className="mt-1">
                    {stats.summary.myAssigned}개 중 {stats.summary.myAssignedInProgress}개 진행 중
                  </CardDescription>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => router.push("/srs?assignee=me")}
              >
                전체 보기
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          {stats.myAssignedSRs.length > 0 && (
            <CardContent>
              <div className="space-y-2 mt-4">
                {stats.myAssignedSRs.map((sr) => {
                  const daysUntilDue = getDaysUntilDue(sr.dueDate);
                  const isOverdue = daysUntilDue !== null && daysUntilDue < 0;
                  return (
                    <Link
                      key={sr.id}
                      href={`/srs/${sr.id}`}
                      className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{sr.srNumber}</span>
                          <Badge variant={statusColors[sr.status] || "default"} className="text-xs">
                            {statusLabels[sr.status] || sr.status}
                          </Badge>
                          <Badge variant={priorityColors[sr.priority] || "default"} className="text-xs">
                            {priorityLabels[sr.priority] || sr.priority}
                          </Badge>
                          {isOverdue && (
                            <Badge variant="destructive" className="text-xs">
                              지연
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 truncate">{sr.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {sr.client.name} • {sr.requester.name}
                          {sr.dueDate && (
                            <span className={isOverdue ? "text-destructive font-medium" : ""}>
                              {" "}• 마감: {new Date(sr.dueDate).toLocaleDateString("ko-KR")}
                              {daysUntilDue !== null && !isOverdue && ` (${daysUntilDue}일 남음)`}
                            </span>
                          )}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground ml-2" />
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Quick Access Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="sr-card cursor-pointer border-l-4 border-l-[hsl(var(--sr-accent-blue))] hover:shadow-md transition-shadow">
          <Link href="/my-requests">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ClipboardList className="h-6 w-6 text-[hsl(var(--sr-accent-blue))]" />
                  <CardTitle className="text-lg font-semibold">내 요청 SR</CardTitle>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>
              <CardDescription className="mt-2">
                내가 요청한 SR의 진행 상황을 확인하세요
              </CardDescription>
            </CardHeader>
          </Link>
        </Card>

        <Card className="sr-card cursor-pointer border-l-4 border-l-green-500 hover:shadow-md transition-shadow">
          <Link href="/srs">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="h-6 w-6 text-green-600" />
                  <CardTitle className="text-lg font-semibold">SR 전체 목록</CardTitle>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>
              <CardDescription className="mt-2">
                모든 SR을 조회하고 관리하세요
              </CardDescription>
            </CardHeader>
          </Link>
        </Card>

        {isAdminManagerEngineer && (
          <Card className="sr-card cursor-pointer border-l-4 border-l-red-500 hover:shadow-md transition-shadow">
            <Link href="/srs?priority=CRITICAL&priority=HIGH">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-6 w-6 text-red-600" />
                    <CardTitle className="text-lg font-semibold">긴급 SR</CardTitle>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </div>
                <CardDescription className="mt-2">
                  {stats.summary.urgent}개의 긴급/높은 우선순위 SR
                </CardDescription>
              </CardHeader>
            </Link>
          </Card>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card 
          className="sr-card cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => router.push("/srs")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 SR</CardTitle>
            <FileText className="h-5 w-5 text-[hsl(var(--sr-primary-dark))]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[hsl(var(--sr-primary-dark))]">{stats.summary.total}</div>
            <p className="text-xs text-muted-foreground mt-1">전체 SR 수</p>
          </CardContent>
        </Card>

        <Card 
          className="sr-card cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => router.push("/srs?status=IN_PROGRESS")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">진행 중</CardTitle>
            <Clock className="h-5 w-5 text-[hsl(var(--sr-accent-blue))]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[hsl(var(--sr-accent-blue))]">
              {stats.summary.inProgress}
            </div>
            <p className="text-xs text-muted-foreground mt-1">처리 중인 SR</p>
            {stats.summary.total > 0 && (
              <Progress 
                value={(stats.summary.inProgress / stats.summary.total) * 100} 
                className="mt-2 h-1.5"
              />
            )}
          </CardContent>
        </Card>

        <Card 
          className="sr-card cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => router.push("/srs?status=COMPLETED&status=CONFIRMED")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">완료</CardTitle>
            <CheckCircle className="h-5 w-5 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.summary.completed}</div>
            <p className="text-xs text-muted-foreground mt-1">완료된 SR</p>
            {stats.summary.total > 0 && (
              <Progress 
                value={(stats.summary.completed / stats.summary.total) * 100} 
                className="mt-2 h-1.5"
              />
            )}
          </CardContent>
        </Card>

        <Card 
          className="sr-card cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => router.push("/srs?status=REQUESTED&status=INTAKE")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">대기 중</CardTitle>
            <AlertCircle className="h-5 w-5 text-[hsl(var(--sr-accent-orange))]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[hsl(var(--sr-accent-orange))]">{stats.summary.pending}</div>
            <p className="text-xs text-muted-foreground mt-1">대기 중인 SR</p>
            {stats.summary.total > 0 && (
              <Progress 
                value={(stats.summary.pending / stats.summary.total) * 100} 
                className="mt-2 h-1.5"
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* 성능 지표 카드 (ADMIN/MANAGER/ENGINEER만) */}
      {isAdminManagerEngineer && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="sr-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">평균 처리 시간</CardTitle>
              <Clock className="h-5 w-5 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {stats.performance.avgProcessingHours > 0 
                  ? `${Math.round(stats.performance.avgProcessingHours)}시간`
                  : "-"
                }
              </div>
              <p className="text-xs text-muted-foreground mt-1">접수부터 완료까지</p>
            </CardContent>
          </Card>

          <Card className="sr-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">SLA 준수율</CardTitle>
              <Target className="h-5 w-5 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {stats.performance.slaComplianceRate > 0 
                  ? `${stats.performance.slaComplianceRate}%`
                  : "-"
                }
              </div>
              <p className="text-xs text-muted-foreground mt-1">마감일 준수율</p>
              {stats.performance.slaComplianceRate > 0 && (
                <Progress 
                  value={stats.performance.slaComplianceRate} 
                  className="mt-2 h-1.5"
                />
              )}
            </CardContent>
          </Card>

          <Card className="sr-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">평균 대기 시간</CardTitle>
              <TrendingUp className="h-5 w-5 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {stats.performance.avgWaitingHours > 0 
                  ? formatWaitingTime(stats.performance.avgWaitingHours)
                  : "-"
                }
              </div>
              <p className="text-xs text-muted-foreground mt-1">접수 대기 평균 시간</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="sr-card">
          <CardHeader>
            <CardTitle className="font-semibold">상태별 SR 분포</CardTitle>
            <CardDescription>현재 SR의 상태별 분포입니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) =>
                    `${name}: ${(percent * 100).toFixed(0)}%`
                  }
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {statusChartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={STATUS_CHART_COLORS[index % STATUS_CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="sr-card">
          <CardHeader>
            <CardTitle className="font-semibold">우선순위별 SR 분포</CardTitle>
            <CardDescription>SR의 우선순위별 분포입니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={priorityChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) =>
                    `${name}: ${(percent * 100).toFixed(0)}%`
                  }
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {priorityChartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        PRIORITY_CHART_COLORS[index % PRIORITY_CHART_COLORS.length]
                      }
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* SR 생성 추이 카드 */}
      <Card className="sr-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-semibold">SR 생성 추이</CardTitle>
              <CardDescription>최근 30일간의 날짜별 SR 생성 수입니다.</CardDescription>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="text-right">
                <div className="text-2xl font-bold text-[hsl(var(--sr-accent-blue))]">
                  {stats.trend.reduce((sum, item) => sum + item.count, 0)}
                </div>
                <div className="text-xs text-muted-foreground">30일 총 생성</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-green-600">
                  {Math.round(stats.trend.reduce((sum, item) => sum + item.count, 0) / 30 * 10) / 10}
                </div>
                <div className="text-xs text-muted-foreground">일평균</div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {stats.trend && Array.isArray(stats.trend) && stats.trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <LineChart 
                  data={stats.trend}
                  margin={{ top: 10, right: 30, left: 20, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.3} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value) => {
                      try {
                        const date = new Date(value);
                        return `${date.getMonth() + 1}/${date.getDate()}`;
                      } catch {
                        return String(value).slice(5, 10);
                      }
                    }}
                    stroke="#6b7280"
                    tick={{ fontSize: 12 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    stroke="#6b7280"
                    tick={{ fontSize: 12 }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#ffffff",
                      border: "1px solid #e5e7eb",
                      borderRadius: "6px",
                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                    }}
                    labelFormatter={(value) => {
                      try {
                        const date = new Date(value);
                        return date.toLocaleDateString("ko-KR", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                          weekday: "short",
                        });
                      } catch {
                        return String(value);
                      }
                    }}
                    formatter={(value: number) => [`${value}개`, "생성 수"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#3b82f6"
                    strokeWidth={3}
                    dot={{ fill: "#3b82f6", r: 4 }}
                    activeDot={{ r: 6, fill: "#2563eb" }}
                    name="SR 수"
                  />
                </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[350px] text-muted-foreground">
              <div className="text-center">
                <p className="text-sm">차트 데이터가 없습니다.</p>
                <p className="text-xs mt-1">SR 생성 데이터가 충분하지 않습니다.</p>
              </div>
            </div>
          )}
          {stats.trend && stats.trend.length > 0 && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-[#3b82f6]" />
                  <span className="text-muted-foreground">일일 생성 수</span>
                </div>
              </div>
              <div className="text-muted-foreground">
                최대: {Math.max(...stats.trend.map((item) => item.count))}개 / 
                최소: {Math.min(...stats.trend.map((item) => item.count))}개
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent SRs */}
      <Card className="sr-card">
        <CardHeader>
          <CardTitle className="font-semibold">최근 SR 활동</CardTitle>
          <CardDescription>
            최근 생성된 SR 목록입니다. (최근 10개)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stats.recentSRs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              아직 SR이 없습니다. 첫 SR을 생성해보세요!
            </div>
          ) : (
            <div className="space-y-4">
              {stats.recentSRs.map((sr) => (
                <div
                  key={sr.id}
                  className="flex items-center justify-between border-b border-border pb-4 last:border-0 last:pb-0 hover:bg-muted/30 -mx-2 px-2 py-2 rounded transition-colors"
                >
                  <div className="flex-1">
                    <Link
                      href={`/srs/${sr.id}`}
                      className="font-medium text-[hsl(var(--sr-primary-dark))] hover:text-[hsl(var(--sr-accent-orange))] hover:underline transition-colors"
                    >
                      {sr.srNumber}
                    </Link>
                    <p className="text-sm text-muted-foreground mt-0.5">{sr.title}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs text-muted-foreground">
                        {sr.client.name}
                      </span>
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className="text-xs text-muted-foreground">
                        {sr.requester.name}
                      </span>
                      {sr.assignedTo && (
                        <>
                          <span className="text-xs text-muted-foreground">
                            •
                          </span>
                          <span className="text-xs text-muted-foreground">
                            담당: {sr.assignedTo.name}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={priorityColors[sr.priority]}>
                      {priorityLabels[sr.priority]}
                    </Badge>
                    <Badge variant={statusColors[sr.status]}>
                      {statusLabels[sr.status]}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Client Stats */}
      {stats.byClient.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>고객사별 SR 수</CardTitle>
            <CardDescription>고객사별 SR 통계입니다. (상위 10개)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.byClient.map((client) => (
                <div key={client.clientId} className="flex items-center">
                  <div className="flex-1">
                    <div className="font-medium">{client.clientName}</div>
                    <div className="text-sm text-muted-foreground">
                      {client.clientCode}
                    </div>
                  </div>
                  <div className="text-2xl font-bold">{client.count}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
