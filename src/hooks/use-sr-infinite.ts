import { useInfiniteQuery } from "@tanstack/react-query";
import { getSRActivitiesAction, getSRCommentsAction } from "@/actions/sr.actions";
import { PAGINATION } from "@/lib/constants";

/**
 * SR Activities 무한 스크롤 훅
 */
export function useSRActivitiesInfinite(srId: string) {
  return useInfiniteQuery({
    queryKey: ["sr", srId, "activities"],
    queryFn: async ({ pageParam }) => {
      const result = await getSRActivitiesAction(srId, {
        cursor: pageParam,
        limit: PAGINATION.DEFAULT_LIMIT,
      });

      if (!result.success) {
        throw new Error(result.error || "활동 내역을 불러올 수 없습니다.");
      }

      return result.data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!srId,
  });
}

/**
 * SR Comments 무한 스크롤 훅
 */
export function useSRCommentsInfinite(srId: string) {
  return useInfiniteQuery({
    queryKey: ["sr", srId, "comments"],
    queryFn: async ({ pageParam }) => {
      const result = await getSRCommentsAction(srId, {
        cursor: pageParam,
        limit: PAGINATION.DEFAULT_LIMIT,
      });

      if (!result.success) {
        throw new Error(result.error || "댓글을 불러올 수 없습니다.");
      }

      return result.data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!srId,
  });
}
