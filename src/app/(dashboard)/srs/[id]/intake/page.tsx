"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { CalendarIcon, Clock, AlertCircle, User, CheckCircle } from "lucide-react";
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
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// Intake 폼 스키마
const intakeFormSchema = z.object({
  actualPriority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"], {
    message: "실제 우선순위를 선택해주세요",
  }),
  estimatedHours: z
    .number()
    .positive("예상 작업 시간은 0보다 커야 합니다")
    .max(1000, "예상 작업 시간은 1000시간을 초과할 수 없습니다"),
  estimatedCompletionDate: z.date({
    message: "예상 완료일을 선택해주세요",
  }),
  intakeNotes: z.string().optional(),
  assigneeId: z.string().min(1, "담당자를 선택해주세요"),
});

type IntakeFormValues = z.infer<typeof intakeFormSchema>;

interface SRDetail {
  id: string;
  srNumber: string;
  title: string;
  description: string;
  status: string;
  requestedPriority: string;
  requestedCompletionDate?: string | null;
  client: {
    id: string;
    code: string;
    name: string;
  };
  requester: {
    id: string;
    name: string;
    email: string;
  };
  serviceCategory: {
    id: string;
    categoryName: string;
    slaHours: number;
    handlerId?: string | null;
    handler?: {
      id: string;
      name: string;
    } | null;
  };
  attachments: Array<{
    id: string;
    fileName: string;
    fileSize: number;
    fileType: string;
    fileUrl: string;
    createdAt: string;
  }>;
}

interface User {
  id: string;
  name: string;
  email: string;
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

export default function SRIntakePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [sr, setSr] = useState<SRDetail | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false); // 수정 모드 여부
  const router = useRouter();
  const { toast } = useToast();

  const form = useForm<IntakeFormValues>({
    resolver: zodResolver(intakeFormSchema),
    defaultValues: {
      actualPriority: "MEDIUM",
      estimatedHours: 0,
      intakeNotes: "",
    },
  });

  // SR 및 사용자 목록 조회
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // SR 정보 조회
        const srResponse = await fetch(`/api/srs/${id}/intake`);
        if (!srResponse.ok) throw new Error("SR을 불러오는데 실패했습니다");
        const srData = await srResponse.json();

        // 상태에 따라 모드 결정
        if (srData.status === "REQUESTED") {
          setIsEditMode(false); // 접수 모드
        } else if (srData.status === "IN_PROGRESS") {
          setIsEditMode(true); // 수정 모드
        } else {
          // REQUESTED나 IN_PROGRESS가 아닌 경우 목록으로 리다이렉트
          toast({
            title: "알림",
            description: "이 SR은 수정할 수 없습니다. SR 목록으로 이동합니다.",
            variant: "default",
          });
          router.push("/srs");
          return;
        }

        setSr(srData);

        // 사용자 목록 조회 (담당자 선택용)
        const usersResponse = await fetch("/api/users?role=ENGINEER,ADMIN");
        if (!usersResponse.ok) throw new Error("사용자 목록을 불러오는데 실패했습니다");
        const usersData = await usersResponse.json();
        setUsers(usersData.users || []);

        // 수정 모드인 경우 기존 값 설정, 접수 모드인 경우 기본값 설정
        if (srData.status === "IN_PROGRESS") {
          // 수정 모드: 기존 접수 정보 로드
          form.setValue("actualPriority", srData.actualPriority || "MEDIUM");
          form.setValue("estimatedHours", srData.estimatedHours || srData.serviceCategory.slaHours);
          form.setValue("estimatedCompletionDate", srData.estimatedCompletionDate ? new Date(srData.estimatedCompletionDate) : new Date());
          form.setValue("intakeNotes", srData.intakeNotes || "");
          form.setValue("assigneeId", srData.assignee?.id || "");
        } else {
          // 접수 모드: 기본값 설정
          // 서비스 카테고리 담당자가 있으면 자동 선택
          if (srData.serviceCategory.handler) {
            form.setValue("assigneeId", srData.serviceCategory.handler.id);
          }

          // 요청자가 희망한 우선순위를 기본값으로 설정
          form.setValue("actualPriority", srData.requestedPriority);

          // SLA 기반 기본 예상 시간 설정
          form.setValue("estimatedHours", srData.serviceCategory.slaHours);

          // 기본 완료 예정일 설정 (오늘 + SLA 시간)
          const defaultDate = new Date();
          defaultDate.setHours(defaultDate.getHours() + srData.serviceCategory.slaHours);
          form.setValue("estimatedCompletionDate", defaultDate);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        toast({
          title: "오류",
          description: "데이터를 불러오는데 실패했습니다.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, router, toast, form]);

  // 접수/수정 처리
  const onSubmit = async (values: IntakeFormValues) => {
    setSubmitting(true);
    try {
      const url = isEditMode
        ? `/api/srs/${id}` // 수정 모드: PATCH 엔드포인트
        : `/api/srs/${id}/intake`; // 접수 모드: POST 엔드포인트

      const method = isEditMode ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...values,
          estimatedCompletionDate: values.estimatedCompletionDate.toISOString(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || (isEditMode ? "수정에 실패했습니다" : "접수 처리에 실패했습니다"));
      }

      const data = await response.json();

      toast({
        title: "성공",
        description: isEditMode ? "SR이 성공적으로 수정되었습니다." : "SR이 성공적으로 접수되었습니다.",
      });

      // 접수 대기 큐 또는 전체 목록으로 이동
      router.push(isEditMode ? "/srs" : "/srs/intake-queue");
    } catch (error) {
      console.error("Error submitting intake:", error);
      toast({
        title: "오류",
        description: error instanceof Error ? error.message : "접수 처리 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">로딩 중...</p>
      </div>
    );
  }

  if (!sr) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">SR을 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {isEditMode ? "SR 접수 정보 수정" : "SR 접수 처리"}
          </h1>
          <p className="text-muted-foreground">
            {isEditMode
              ? "접수된 SR의 정보를 수정하세요."
              : "SR을 검토하고 접수 정보를 입력하세요."}
          </p>
        </div>
        <Link href={isEditMode ? "/srs" : "/srs/intake-queue"}>
          <Button variant="outline">
            {isEditMode ? "목록으로 돌아가기" : "대기 큐로 돌아가기"}
          </Button>
        </Link>
      </div>

      {/* Step 1: SR 정보 검토 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold">
              1
            </div>
            <CardTitle>SR 정보 검토</CardTitle>
          </div>
          <CardDescription>
            요청자가 등록한 SR 내용을 검토하세요
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* SR 번호 및 상태 */}
          <div className="flex items-center gap-4">
            <div>
              <p className="text-sm text-muted-foreground">SR 번호</p>
              <p className="text-2xl font-bold">{sr.srNumber}</p>
            </div>
            <Separator orientation="vertical" className="h-12" />
            <div>
              <p className="text-sm text-muted-foreground">요청 우선순위</p>
              <Badge variant={priorityColors[sr.requestedPriority]}>
                {priorityLabels[sr.requestedPriority]}
              </Badge>
            </div>
            {sr.requestedCompletionDate && (
              <>
                <Separator orientation="vertical" className="h-12" />
                <div>
                  <p className="text-sm text-muted-foreground">희망 완료일</p>
                  <p className="font-medium">
                    {format(new Date(sr.requestedCompletionDate), "PPP", { locale: ko })}
                  </p>
                </div>
              </>
            )}
          </div>

          <Separator />

          {/* 제목 및 설명 */}
          <div>
            <p className="text-sm font-medium text-muted-foreground">제목</p>
            <p className="text-lg font-semibold">{sr.title}</p>
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground">상세 내용</p>
            <p className="text-sm whitespace-pre-wrap bg-muted p-4 rounded-md">
              {sr.description}
            </p>
          </div>

          <Separator />

          {/* 고객사 및 요청자 정보 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">고객사</p>
              <p className="font-medium">{sr.client.name}</p>
              <p className="text-xs text-muted-foreground">{sr.client.code}</p>
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground">서비스 카테고리</p>
              <p className="font-medium">{sr.serviceCategory.categoryName}</p>
              <p className="text-xs text-muted-foreground">
                SLA: {sr.serviceCategory.slaHours}시간
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground">요청자</p>
              <p className="font-medium">{sr.requester.name}</p>
              <p className="text-xs text-muted-foreground">{sr.requester.email}</p>
            </div>
          </div>

          {/* 첨부파일 */}
          {sr.attachments.length > 0 && (
            <>
              <Separator />
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">
                  첨부파일 ({sr.attachments.length}개)
                </p>
                <div className="space-y-2">
                  {sr.attachments.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-2 bg-muted rounded"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{file.fileName}</span>
                        <span className="text-xs text-muted-foreground">
                          ({(file.fileSize / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                      <a
                        href={file.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline"
                      >
                        다운로드
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Step 2: 접수 정보 입력 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold">
              2
            </div>
            <CardTitle>접수 정보 입력</CardTitle>
          </div>
          <CardDescription>
            실제 우선순위, 예상 작업시간, 담당자 등을 결정하세요
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* 실제 우선순위 */}
              <FormField
                control={form.control}
                name="actualPriority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>실제 우선순위 *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="우선순위를 선택하세요" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="CRITICAL">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-red-600" />
                            긴급 (CRITICAL)
                          </div>
                        </SelectItem>
                        <SelectItem value="HIGH">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-orange-600" />
                            높음 (HIGH)
                          </div>
                        </SelectItem>
                        <SelectItem value="MEDIUM">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-blue-600" />
                            보통 (MEDIUM)
                          </div>
                        </SelectItem>
                        <SelectItem value="LOW">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-gray-600" />
                            낮음 (LOW)
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      요청자의 희망 우선순위: {priorityLabels[sr.requestedPriority]}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 예상 작업 시간 */}
              <FormField
                control={form.control}
                name="estimatedHours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>예상 작업 시간 (시간) *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.5"
                        placeholder="예: 8"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>
                      SLA 기준: {sr.serviceCategory.slaHours}시간
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 예상 완료일 */}
              <FormField
                control={form.control}
                name="estimatedCompletionDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>예상 완료일 *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP", { locale: ko })
                            ) : (
                              <span>날짜를 선택하세요</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) =>
                            date < new Date(new Date().setHours(0, 0, 0, 0))
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormDescription>
                      {sr.requestedCompletionDate && (
                        <>
                          요청자 희망일:{" "}
                          {format(new Date(sr.requestedCompletionDate), "PPP", {
                            locale: ko,
                          })}
                        </>
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 담당자 선택 */}
              <FormField
                control={form.control}
                name="assigneeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>담당자 *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="담당자를 선택하세요" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {users.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              {user.name} ({user.email})
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {sr.serviceCategory.handler && (
                        <>
                          추천 담당자: {sr.serviceCategory.handler.name}
                        </>
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 접수 메모 */}
              <FormField
                control={form.control}
                name="intakeNotes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>접수 메모 (선택)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="SR에 대한 분석 내용이나 특이사항을 기록하세요"
                        className="min-h-[100px]"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      SR 처리에 도움이 될 정보를 기록하세요
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 제출 버튼 */}
              <div className="flex gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push("/srs/intake-queue")}
                  className="flex-1"
                  disabled={submitting}
                >
                  취소
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Clock className="mr-2 h-4 w-4 animate-spin" />
                      {isEditMode ? "수정 중..." : "접수 처리 중..."}
                    </>
                  ) : (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      {isEditMode ? "수정 완료" : "SR 접수하기"}
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
