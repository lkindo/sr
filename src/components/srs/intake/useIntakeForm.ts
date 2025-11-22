/**
 * SR 접수 폼 커스텀 훅
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { getSRHandlersForSelection } from "@/actions/user.actions";
import type { SRDetails } from "@/types/sr.types";
import type { User } from "./types";

// Intake 폼 스키마
export const intakeFormSchema = z.object({
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

export type IntakeFormValues = z.infer<typeof intakeFormSchema>;

interface UseIntakeFormOptions {
  srId: string;
  onSuccess?: () => void;
}

export function useIntakeForm({ srId, onSuccess }: UseIntakeFormOptions) {
  const [sr, setSr] = useState<SRDetails | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
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
        const srResponse = await fetch(`/api/srs/${srId}/intake`);
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

        // 사용자 목록 조회 (담당자 선택용) - SR 처리 권한이 있는 사용자만
        try {
          const usersResult = await getSRHandlersForSelection();
          if (usersResult.success && usersResult.data) {
            setUsers(usersResult.data);
            console.log("로드된 사용자 목록:", usersResult.data.length, "명");
          } else {
            console.error("사용자 목록 조회 실패:", usersResult.success === false ? usersResult.error : "알 수 없는 오류");
            setUsers([]);
            toast({
              title: "경고",
              description: usersResult.success === false ? usersResult.error : "담당자 목록을 불러오는데 실패했습니다.",
              variant: "destructive",
            });
          }
        } catch (error) {
          console.error("사용자 목록 조회 중 오류:", error);
          setUsers([]);
          toast({
            title: "경고",
            description: "담당자 목록을 불러오는데 실패했습니다. 페이지를 새로고침해주세요.",
            variant: "destructive",
          });
        }

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
  }, [srId, router, toast, form]);

  // 접수/수정 처리
  const onSubmit = async (values: IntakeFormValues) => {
    setSubmitting(true);
    
    // 수정 모드: PATCH /api/srs/[id]/intake 사용
    // 접수 모드: POST /api/srs/[id]/intake 사용
    const url = `/api/srs/${srId}/intake`;
    const method = isEditMode ? "PATCH" : "POST";

    // 수정 모드와 접수 모드 모두 동일한 형식으로 전송 (서버에서 변경 여부 확인)
    const requestBody = {
      actualPriority: values.actualPriority,
      estimatedHours: values.estimatedHours,
      estimatedCompletionDate: values.estimatedCompletionDate.toISOString(),
      intakeNotes: values.intakeNotes || "",
      assigneeId: values.assigneeId,
    };

    try {
      console.log("Submitting intake:", { url, method, requestBody, isEditMode });

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      console.log("Response status:", response.status, response.statusText);

      if (!response.ok) {
        let errorMessage = isEditMode ? "수정에 실패했습니다" : "접수 처리에 실패했습니다";
        try {
          // 응답 본문을 텍스트로 먼저 읽기
          const responseText = await response.text();
          console.error("Error response text:", responseText);
          
          if (responseText) {
            try {
              const errorData = JSON.parse(responseText);
              console.error("Error response data:", errorData);
              errorMessage = errorData.error || errorData.message || errorMessage;
            } catch (jsonError) {
              // JSON이 아닌 경우 텍스트를 그대로 사용
              errorMessage = responseText || errorMessage;
            }
          } else {
            // 응답 본문이 비어있는 경우
            errorMessage = `서버 오류 (${response.status}): ${response.statusText || "알 수 없는 오류"}`;
          }
        } catch (parseError) {
          console.error("Failed to read error response:", parseError);
          // 응답 읽기 실패 시 상태 코드로 메시지 생성
          errorMessage = `서버 오류 (${response.status}): ${response.statusText || "응답을 읽을 수 없습니다"}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log("Success response:", data);

      toast({
        title: "성공",
        description: isEditMode ? "SR이 성공적으로 수정되었습니다." : "SR이 성공적으로 접수되었습니다.",
      });

      // SR 목록으로 이동
      router.push("/srs");
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error("Error submitting intake:", error);
      console.error("Error details:", {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        url,
        method,
        requestBody,
        isEditMode,
      });
      
      const errorMessage = error instanceof Error 
        ? error.message 
        : typeof error === 'string' 
        ? error 
        : "접수 처리 중 오류가 발생했습니다.";
      
      toast({
        title: "오류",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return {
    sr,
    users,
    loading,
    submitting,
    isEditMode,
    form,
    onSubmit,
  };
}


