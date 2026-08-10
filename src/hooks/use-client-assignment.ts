import { useCallback, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useToast } from '@/hooks/use-toast';
import { apiDelete, ApiError, apiPatch } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

/**
 * 사용자의 고객사 소속을 바꾸는 변이 3종(할당·변경·해제)의 단일 구현.
 *
 * ── 왜 훅으로 합쳤나 ────────────────────────────────────────────────────────
 * `ClientAssignDropdown`(할당)과 `ClientBadgeWithActions`(변경)는 **같은 라우트에
 * 같은 본문을 보내고 같은 409 재시도 플로우를 돌리는** 코드를 각자 들고 있었다.
 * 토스트 문구와 닫아야 할 팝오버만 다르다. 그래서 문구·후처리는 옵션으로 받고
 * 메커니즘만 여기 둔다.
 *
 * ── ⚠️ 409 는 에러가 아니라 UI 상태다 ──────────────────────────────────────
 * 서버는 "진행 중인 SR 이 있다" 를 `409 + code:'ONGOING_SRS'` 로 알린다. 이것은
 * **실패가 아니라 확인을 요구하는 중간 상태**이고, 사용자가 확인하면 `force:true` 로
 * 같은 요청을 다시 쏜다. 이 응답을 `useMutation` 의 에러로 흘리면 확인 다이얼로그와
 * **함께 빨간 토스트가 뜨는 회귀**가 난다. 그래서 `mutationFn` 안에서 잡아
 * `{ needsForce: true }` 라는 **정상 반환값**으로 바꾸고 `onSuccess` 에서 분기한다.
 *
 * 서버가 메시지를 주지 않았을 때의 문구(`fallbackMessage`)는 화면마다 달랐던
 * 원래 `throw new Error(...)` 문구를 그대로 옮긴 것이다. 바꾸지 말 것.
 */

/** 할당/변경의 대상 고객사. 토스트 문구가 이름을 쓰므로 id 와 함께 들고 다닌다. */
export interface ClientAssignmentTarget {
  clientId: string;
  clientName: string;
}

/** 진행 중인 SR 때문에 서버가 거부한 요청. 확인 UI 가 이 값을 그린다. */
export interface BlockedAssignment extends ClientAssignmentTarget {
  ongoingSRCount: number;
}

/** `mutationFn` 의 반환값. 409 는 실패가 아니라 이 합집합의 한 갈래다. */
type AssignOutcome =
  | { needsForce: true; blocked: BlockedAssignment }
  | { needsForce: false; target: ClientAssignmentTarget; ongoingSRsHandled: number };

interface AssignVariables extends ClientAssignmentTarget {
  force: boolean;
}

/** 할당/변경 라우트의 성공 본문. 강제 할당 시 서버가 처리한 진행 중 SR 건수를 알려준다. */
interface AssignResponseBody {
  data?: { ongoingSRsHandled?: number } | null;
}

/** 409 본문에서 진행 중 SR 건수를 뽑는다. 원래 코드의 `result.data?.ongoingSRCount || 0`. */
function readOngoingSRCount(body: unknown): number {
  if (body && typeof body === 'object') {
    const data = (body as { data?: unknown }).data;
    if (data && typeof data === 'object') {
      const count = (data as { ongoingSRCount?: unknown }).ongoingSRCount;
      if (typeof count === 'number') return count;
    }
  }
  return 0;
}

export interface UseAssignClientOptions {
  userId: string;
  /** 서버가 에러 메시지를 주지 않았을 때 쓸 문구. 화면마다 다르다. */
  fallbackMessage: string;
  /** 성공 토스트 본문. 서버가 처리한 진행 중 SR 건수에 따라 문장이 갈린다. */
  successDescription: (target: ClientAssignmentTarget, ongoingSRsHandled: number) => string;
  /** 실패 토스트 본문. 서버 메시지가 없을 때만 쓰인다(= 에러가 `Error` 가 아닐 때). */
  errorDescription: string;
  /** 409 로 막혀 확인 다이얼로그를 띄우기 직전. 원래 코드의 "팝오버 닫기" 자리다. */
  onBlocked?: () => void;
  /** 성공 확정 후. 원래 코드의 "팝오버 닫기 + onAssigned/onChanged" 자리다. */
  onApplied?: () => void;
}

/**
 * `PATCH /api/users/{id}/client` — 고객사 할당/변경.
 *
 * `pending` 이 `null` 이 아니면 확인 다이얼로그를 띄운다. 확인 버튼은
 * `assign(pending, true)` 로 같은 요청을 강제 플래그와 함께 다시 보낸다.
 */
export function useAssignClient({
  userId,
  fallbackMessage,
  successDescription,
  errorDescription,
  onBlocked,
  onApplied,
}: UseAssignClientOptions) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // 진행 중인 SR 때문에 서버가 거부한 요청 (확인 후 강제 재시도용)
  const [pending, setPending] = useState<BlockedAssignment | null>(null);

  const mutation = useMutation({
    mutationFn: async ({
      clientId,
      clientName,
      force,
    }: AssignVariables): Promise<AssignOutcome> => {
      const target = { clientId, clientName };
      try {
        // force 가 아닐 때는 플래그 자체를 보내지 않는다(원래 본문 그대로).
        const result = await apiPatch<AssignResponseBody>(
          `/api/users/${userId}/client`,
          force ? { clientId, force: true } : { clientId },
          { fallbackMessage }
        );
        return {
          needsForce: false,
          target,
          ongoingSRsHandled: result?.data?.ongoingSRsHandled || 0,
        };
      } catch (error) {
        // 위 파일 주석의 ⚠️ 참조 — 409 는 에러가 아니라 확인 요구다.
        if (error instanceof ApiError && error.status === 409 && error.code === 'ONGOING_SRS') {
          return {
            needsForce: true,
            blocked: { ...target, ongoingSRCount: readOngoingSRCount(error.body) },
          };
        }
        throw error;
      }
    },
    onSuccess: (outcome) => {
      if (outcome.needsForce) {
        setPending(outcome.blocked);
        onBlocked?.();
        return;
      }

      toast({
        title: '성공',
        description: successDescription(outcome.target, outcome.ongoingSRsHandled),
      });

      setPending(null);
      queryClient.invalidateQueries({ queryKey: qk.users.all });
      onApplied?.();
    },
    onError: (error) => {
      // 실패하면 확인 다이얼로그도 닫는다(원래 동작).
      setPending(null);
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : errorDescription,
        variant: 'destructive',
      });
    },
  });

  const { mutate } = mutation;
  const assign = useCallback(
    (target: ClientAssignmentTarget, force = false) => {
      mutate({ ...target, force });
    },
    [mutate]
  );

  return {
    assign,
    /** 확인 다이얼로그가 열려 있으면 그 대상, 아니면 `null`. */
    pending,
    /** 다이얼로그를 사용자가 닫았을 때. */
    clearPending: useCallback(() => setPending(null), []),
    isProcessing: mutation.isPending,
  };
}

export interface UseRemoveClientOptions {
  userId: string;
  /** 서버가 에러 메시지를 주지 않았을 때 쓸 문구. */
  fallbackMessage: string;
  successDescription: string;
  errorDescription: string;
  /** 성공 후. 원래 코드의 "다이얼로그 닫기 + onChanged" 자리다. */
  onRemoved?: () => void;
}

/**
 * `DELETE /api/users/{id}/client` — 고객사 소속 해제(UserClient 레코드 삭제).
 *
 * 여기에는 409 플로우가 없다. 해제는 진행 중인 SR 을 건드리지 않기 때문이다.
 */
export function useRemoveClient({
  userId,
  fallbackMessage,
  successDescription,
  errorDescription,
  onRemoved,
}: UseRemoveClientOptions) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => apiDelete<unknown>(`/api/users/${userId}/client`, { fallbackMessage }),
    onSuccess: () => {
      toast({ title: '성공', description: successDescription });
      queryClient.invalidateQueries({ queryKey: qk.users.all });
      onRemoved?.();
    },
    onError: (error) => {
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : errorDescription,
        variant: 'destructive',
      });
    },
  });

  const { mutate } = mutation;
  return {
    remove: useCallback(() => mutate(), [mutate]),
    isProcessing: mutation.isPending,
  };
}
