import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSRDetailsAction, updateSRAction, deleteSRAction } from "@/actions/sr.actions";
import type { SRDetails } from "@/types/sr.types";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";

/**
 * SR 상세 조회 훅
 */
export function useSRDetails(srId: string) {
  return useQuery({
    queryKey: ["sr", srId],
    queryFn: async () => {
      const result = await getSRDetailsAction(srId);
      if (!result.success) {
        throw new Error(result.error || "SR을 불러올 수 없습니다.");
      }
      return result.data;
    },
    enabled: !!srId,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 3000),
  });
}

/**
 * SR 수정 훅 (Optimistic Updates 적용)
 */
export function useUpdateSR(srId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (formData: FormData) => {
      const result = await updateSRAction(srId, formData);
      if (!result.success) {
        throw new Error(result.error || "SR 수정에 실패했습니다.");
      }
      return result.data;
    },
    onMutate: async (formData) => {
      // 진행 중인 쿼리 취소
      await queryClient.cancelQueries({ queryKey: ["sr", srId] });

      // 이전 데이터 백업
      const previousSR = queryClient.getQueryData<SRDetails>(["sr", srId]);

      // Optimistic Update: 즉시 UI 업데이트
      if (previousSR) {
        const title = formData.get("title") as string | null;
        const description = formData.get("description") as string | null;
        const status = formData.get("status") as string | null;
        const priority = formData.get("priority") as string | null;

        queryClient.setQueryData<SRDetails>(["sr", srId], {
          ...previousSR,
          ...(title && { title }),
          ...(description && { description }),
          ...(status && { status: status as any }),
          ...(priority && { priority: priority as any }),
        });
      }

      return { previousSR };
    },
    onError: (error, variables, context) => {
      // 에러 발생 시 이전 데이터로 롤백
      if (context?.previousSR) {
        queryClient.setQueryData(["sr", srId], context.previousSR);
      }
      toast({
        title: "오류",
        description: error instanceof Error ? error.message : "SR 수정에 실패했습니다.",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      toast({
        title: "성공",
        description: "SR이 수정되었습니다.",
      });
    },
    onSettled: () => {
      // 쿼리 무효화하여 최신 데이터 가져오기
      queryClient.invalidateQueries({ queryKey: ["sr", srId] });
    },
  });
}

/**
 * SR 삭제 훅 (Optimistic Updates 적용)
 */
export function useDeleteSR() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const router = useRouter();

  return useMutation({
    mutationFn: async (srId: string) => {
      const result = await deleteSRAction(srId);
      if (!result.success) {
        throw new Error(result.error || "SR 삭제에 실패했습니다.");
      }
      return srId;
    },
    onMutate: async (srId) => {
      // 진행 중인 쿼리 취소
      await queryClient.cancelQueries({ queryKey: ["sr", srId] });

      // 이전 데이터 백업
      const previousSR = queryClient.getQueryData<SRDetails>(["sr", srId]);

      // Optimistic Update: 즉시 캐시에서 제거
      queryClient.removeQueries({ queryKey: ["sr", srId] });

      return { previousSR, srId };
    },
    onError: (error, srId, context) => {
      // 에러 발생 시 이전 데이터로 복구
      if (context?.previousSR) {
        queryClient.setQueryData(["sr", context.srId], context.previousSR);
      }
      toast({
        title: "오류",
        description: error instanceof Error ? error.message : "SR 삭제에 실패했습니다.",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      toast({
        title: "성공",
        description: "SR이 삭제되었습니다.",
      });
      router.push("/srs");
    },
    onSettled: () => {
      // SR 목록 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: ["srs"] });
    },
  });
}
