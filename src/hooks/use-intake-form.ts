/**
 * SR 접수 폼 커스텀 훅
 */

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import * as z from 'zod';

import { getSRHandlersForSelection } from '@/actions/user.actions';
import { useToast } from '@/hooks/use-toast';
import { apiGet } from '@/lib/api-client';
import type { SRDetails } from '@/types/sr.types';

interface User {
  id: string;
  name: string;
  email: string;
}

// Intake 폼 스키마
const intakeFormSchema = z.object({
  actualPriority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'], {
    message: '실제 우선순위를 선택해주세요',
  }),
  estimatedHours: z
    .number()
    .positive('예상 작업 시간은 0보다 커야 합니다')
    .max(1000, '예상 작업 시간은 1000시간을 초과할 수 없습니다'),
  estimatedCompletionDate: z.date({
    message: '예상 완료일을 선택해주세요',
  }),
  intakeNotes: z.string().optional(),
  assigneeId: z.string().min(1, '담당자를 선택해주세요'),
});

export type IntakeFormValues = z.infer<typeof intakeFormSchema>;

interface UseIntakeFormOptions {
  srId: string;
  onSuccess?: () => void;
}

export function useIntakeForm({ srId }: UseIntakeFormOptions) {
  const [sr, setSr] = useState<SRDetails | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<IntakeFormValues>({
    resolver: zodResolver(intakeFormSchema),
    defaultValues: {
      actualPriority: 'MEDIUM',
      estimatedHours: 0,
      intakeNotes: '',
    },
  });

  // SR 및 사용자 목록 조회
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // SR 정보 조회.
        // 실패는 아래 catch 가 한 문장으로 받는다 — 조회가 안 되면 이 화면에서 할 수 있는
        // 일이 없으므로 서버가 준 이유를 세분해 봐야 사용자가 할 행동이 달라지지 않는다.
        // (제출 실패는 반대다. 거기서는 이유마다 다음 행동이 다르므로 아래에서 풀어 쓴다.)
        const srData = await apiGet<SRDetails>(`/api/srs/${srId}/intake`);

        // 상태에 따라 모드 결정
        if (srData.status === 'REQUESTED') {
          setIsEditMode(false); // 접수 모드
        } else if (srData.status === 'INTAKE' || srData.status === 'IN_PROGRESS') {
          setIsEditMode(true); // 수정 모드
        } else {
          // 수정 불가능한 상태 (ON_HOLD, COMPLETED, CONFIRMED, REJECTED)
          toast({
            title: '알림',
            description: '이 SR은 수정할 수 없습니다. SR 목록으로 이동합니다.',
            variant: 'default',
          });
          router.push('/srs');
          return;
        }

        setSr(srData);

        // 사용자 목록 조회 (담당자 선택용) - SR 처리 권한이 있는 사용자만
        try {
          const usersResult = await getSRHandlersForSelection();
          if (usersResult.success && usersResult.data) {
            setUsers(usersResult.data);
          } else {
            setUsers([]);
            toast({
              title: '경고',
              description:
                usersResult.success === false
                  ? usersResult.error
                  : '담당자 목록을 불러오는데 실패했습니다.',
              variant: 'destructive',
            });
          }
        } catch {
          // 에러 발생 시 빈 배열로 설정, toast로 사용자에게 알림
          setUsers([]);
          toast({
            title: '경고',
            description: '담당자 목록을 불러오는데 실패했습니다. 페이지를 새로고침해주세요.',
            variant: 'destructive',
          });
        }

        // 수정 모드인 경우 기존 값 설정, 접수 모드인 경우 기본값 설정
        if (srData.status === 'INTAKE' || srData.status === 'IN_PROGRESS') {
          // 수정 모드: 기존 접수 정보 로드
          form.setValue('actualPriority', srData.actualPriority || 'MEDIUM');
          // ⚠️ `estimatedHours` 는 Prisma 스키마상 `Decimal?` 이지만 JSON 을 건너오면
          //    number 다. 이관 전에는 `response.json()` 이 any 라 이 어긋남이 드러나지
          //    않았다. `Number()` 는 그 사실을 명시할 뿐 런타임 값은 그대로다.
          //    (`??` 가 아니라 `||` 인 것도 의도다 — 0시간은 "안 정해짐" 으로 보고 SLA 로 돌아간다.)
          form.setValue(
            'estimatedHours',
            Number(srData.estimatedHours || srData.serviceCategory.slaHours)
          );
          form.setValue(
            'estimatedCompletionDate',
            srData.estimatedCompletionDate ? new Date(srData.estimatedCompletionDate) : new Date()
          );
          form.setValue('intakeNotes', srData.intakeNotes || '');
          form.setValue('assigneeId', srData.assignee?.id || '');
        } else {
          // 접수 모드: 기본값 설정
          // 서비스 카테고리 담당자가 있으면 자동 선택
          if (srData.serviceCategory.handler) {
            form.setValue('assigneeId', srData.serviceCategory.handler.id);
          }

          // 요청자가 희망한 우선순위를 기본값으로 설정
          form.setValue('actualPriority', srData.requestedPriority);

          // SLA 기반 기본 예상 시간 설정
          form.setValue('estimatedHours', srData.serviceCategory.slaHours);

          // 기본 완료 예정일 설정 (오늘 + SLA 시간)
          const defaultDate = new Date();
          defaultDate.setHours(defaultDate.getHours() + srData.serviceCategory.slaHours);
          form.setValue('estimatedCompletionDate', defaultDate);
        }
      } catch {
        toast({
          title: '오류',
          description: '데이터를 불러오는데 실패했습니다.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [srId, router, toast, form]);

  // 접수/수정 처리
  const onSubmit = async (values: IntakeFormValues) => {
    // 변수를 상위 스코프로 이동
    const url = `/api/srs/${srId}/intake`;
    const method = isEditMode ? 'PATCH' : 'POST';
    const requestBody = {
      actualPriority: values.actualPriority,
      estimatedHours: values.estimatedHours,
      estimatedCompletionDate: values.estimatedCompletionDate.toISOString(),
      intakeNotes: values.intakeNotes || '',
      assigneeId: values.assigneeId,
    };

    try {
      setSubmitting(true);

      // ⚠️ 여기는 `fetch` 를 그대로 둔다 — `apiPost`/`apiPatch` 로 바꾸면 아래 세 갈래
      //    메시지 중 두 갈래가 사라진다. api-client 는 에러 본문을 `response.json()` 으로만
      //    읽고 실패하면 삼키므로(프록시 502 HTML 을 토스트에 그대로 뿌리지 않으려는 의도된
      //    설계다), **비 JSON 본문 원문**과 `statusText` 가 ApiError 에 남지 않는다.
      //    접수 화면에서는 그 두 가지가 사용자의 다음 행동을 가른다:
      //      - JSON `{error}`      → "담당자가 비활성 상태입니다" → 담당자를 바꿔서 재시도
      //      - 비 JSON 본문        → 게이트웨이/WAF 가 낸 문장 그대로 → 관리자에게 전달
      //      - 본문 없음           → "서버 오류 (500): ..." → 상태코드로 문의
      //    첫 갈래만 api-client 로 재현되므로, 세 갈래를 유지하기 위해 이 한 곳은 남긴다.
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        let errorMessage = isEditMode ? '수정에 실패했습니다' : '접수 처리에 실패했습니다';
        try {
          // 응답 본문을 텍스트로 먼저 읽기
          const responseText = await response.text();

          if (responseText) {
            try {
              const errorData = JSON.parse(responseText);

              errorMessage = errorData.error || errorData.message || errorMessage;
            } catch {
              // JSON이 아닌 경우 텍스트를 그대로 사용
              errorMessage = responseText || errorMessage;
            }
          } else {
            // 응답 본문이 비어있는 경우
            errorMessage = `서버 오류 (${response.status}): ${response.statusText || '알 수 없는 오류'}`;
          }
        } catch {
          // 응답 읽기 실패 시 상태 코드로 메시지 생성
          errorMessage = `서버 오류 (${response.status}): ${response.statusText || '응답을 읽을 수 없습니다'}`;
        }
        throw new Error(errorMessage);
      }

      try {
        await response.json();
      } catch {
        // ignore
      }

      toast({
        title: '성공',
        description: isEditMode ? '접수 정보가 수정되었습니다.' : 'SR이 접수되었습니다.',
      });

      // 캐시 무효화 (SR 목록 및 상세 페이지에 즉시 반영)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sr', srId] }),
        queryClient.invalidateQueries({ queryKey: ['srs'] }),
      ]);

      // SPA 방식으로 페이지 이동
      router.refresh();
      router.push('/srs');

      // 성공 시에는 submitting을 false로 설정하지 않음 (페이지 이동 중이므로)
      // 페이지가 이동되면서 컴포넌트가 언마운트되므로 상태 업데이트 불필요
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : '접수 처리 중 오류가 발생했습니다.';

      toast({
        title: '오류',
        description: errorMessage,
        variant: 'destructive',
      });

      // 에러 발생 시에만 submitting을 false로 설정
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
