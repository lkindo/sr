"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { FileText, Clock, CheckCircle, AlertCircle } from "lucide-react";
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

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
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
  };

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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          SR 관리 시스템 대시보드에 오신 것을 환영합니다.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 SR</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.summary.total}</div>
            <p className="text-xs text-muted-foreground">전체 SR 수</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">진행 중</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.summary.inProgress}
            </div>
            <p className="text-xs text-muted-foreground">처리 중인 SR</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">완료</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.summary.completed}</div>
            <p className="text-xs text-muted-foreground">완료된 SR</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">대기 중</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.summary.pending}</div>
            <p className="text-xs text-muted-foreground">대기 중인 SR</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>상태별 SR 분포</CardTitle>
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

        <Card>
          <CardHeader>
            <CardTitle>우선순위별 SR 분포</CardTitle>
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
      <Card>
        <CardHeader>
          <CardTitle>SR 생성 추이 (최근 30일)</CardTitle>
          <CardDescription>날짜별 SR 생성 수입니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={stats.trend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return `${date.getMonth() + 1}/${date.getDate()}`;
                }}
              />
              <YAxis />
              <Tooltip
                labelFormatter={(value) => {
                  const date = new Date(value);
                  return date.toLocaleDateString("ko-KR");
                }}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#3b82f6"
                strokeWidth={2}
                name="SR 수"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Recent SRs */}
      <Card>
        <CardHeader>
          <CardTitle>최근 SR 활동</CardTitle>
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
                  className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
                >
                  <div className="flex-1">
                    <Link
                      href={`/srs/${sr.id}`}
                      className="font-medium hover:underline"
                    >
                      {sr.srNumber}
                    </Link>
                    <p className="text-sm text-muted-foreground">{sr.title}</p>
                    <div className="flex items-center gap-2 mt-1">
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
