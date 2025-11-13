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
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { FileText, Clock, CheckCircle, AlertCircle, Inbox, ClipboardList, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DashboardStats {
  summary: {
    total: number;
    inProgress: number;
    completed: number;
    pending: number;
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

  return (
    <div className="sr-content-area space-y-6">
      <div className="sr-list-head">
        <div>
          <h1 className="sr-list-title text-3xl">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            SR 관리 시스템 대시보드에 오신 것을 환영합니다.
          </p>
        </div>
      </div>

      {/* Quick Access Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="sr-card cursor-pointer border-l-4 border-l-[hsl(var(--sr-accent-blue))]">
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

        <Card className="sr-card cursor-pointer border-l-4 border-l-[hsl(var(--sr-accent-orange))]">
          <Link href="/srs/intake-queue">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Inbox className="h-6 w-6 text-[hsl(var(--sr-accent-orange))]" />
                  <CardTitle className="text-lg font-semibold">SR 접수 대기</CardTitle>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>
              <CardDescription className="mt-2">
                접수 대기 중인 SR을 검토하고 처리하세요
              </CardDescription>
            </CardHeader>
          </Link>
        </Card>

        <Card className="sr-card cursor-pointer border-l-4 border-l-green-500">
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
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="sr-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 SR</CardTitle>
            <FileText className="h-5 w-5 text-[hsl(var(--sr-primary-dark))]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[hsl(var(--sr-primary-dark))]">{stats.summary.total}</div>
            <p className="text-xs text-muted-foreground mt-1">전체 SR 수</p>
          </CardContent>
        </Card>

        <Card className="sr-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">진행 중</CardTitle>
            <Clock className="h-5 w-5 text-[hsl(var(--sr-accent-blue))]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[hsl(var(--sr-accent-blue))]">
              {stats.summary.inProgress}
            </div>
            <p className="text-xs text-muted-foreground mt-1">처리 중인 SR</p>
          </CardContent>
        </Card>

        <Card className="sr-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">완료</CardTitle>
            <CheckCircle className="h-5 w-5 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.summary.completed}</div>
            <p className="text-xs text-muted-foreground mt-1">완료된 SR</p>
          </CardContent>
        </Card>

        <Card className="sr-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">대기 중</CardTitle>
            <AlertCircle className="h-5 w-5 text-[hsl(var(--sr-accent-orange))]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[hsl(var(--sr-accent-orange))]">{stats.summary.pending}</div>
            <p className="text-xs text-muted-foreground mt-1">대기 중인 SR</p>
          </CardContent>
        </Card>
      </div>

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

      {/* Trend Chart */}
      <Card className="sr-card">
        <CardHeader>
          <CardTitle className="font-semibold">SR 생성 추이 (최근 30일)</CardTitle>
          <CardDescription>날짜별 SR 생성 수입니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={stats.trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return `${date.getMonth() + 1}/${date.getDate()}`;
                }}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                labelFormatter={(value) => {
                  const date = new Date(value);
                  return date.toLocaleDateString("ko-KR");
                }}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="hsl(var(--sr-accent-blue))"
                strokeWidth={3}
                name="SR 수"
              />
            </LineChart>
          </ResponsiveContainer>
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
