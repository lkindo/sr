'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui';
import { Input } from '@/components/ui';
import { Label } from '@/components/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { useToast } from '@/hooks/use-toast';
import { apiPatch, apiPost } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

interface ServiceCategory {
  id: string;
  categoryName: string;
  description?: string | null;
  slaHours: number;
  priority: string;
  handlerId?: string | null;
  backupHandlerId?: string | null;
}

interface ServiceCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  /** null 이면 생성 모드 */
  category: ServiceCategory | null;
  onSaved: () => void;
}

const PRIORITY_OPTIONS = [
  { value: 'CRITICAL', label: '긴급' },
  { value: 'HIGH', label: '높음' },
  { value: 'MEDIUM', label: '보통' },
  { value: 'LOW', label: '낮음' },
] as const;

const DEFAULT_SLA_HOURS = '24';

/**
 * 서버가 `error` 를 주지 않았을 때 쓸 문구. 예전 `body.error || '저장에 실패했습니다.'` 의
 * 우변이 그대로 이사한 것이다 — 502 처럼 본문이 JSON 이 아닐 때가 여기에 해당한다.
 */
const SAVE_ERROR_MESSAGE = '저장에 실패했습니다.';

/** 저장 요청 본문. 서버는 URL 의 clientId 만 신뢰하므로 고객사 id 는 싣지 않는다. */
interface CategoryPayload {
  categoryName: string;
  description?: string;
  slaHours: number;
  priority: string;
}

/**
 * 서비스 카테고리 생성/편집 다이얼로그.
 *
 * 이 UI 가 없던 시절, 신규 고객사는 카테고리가 0개라 SR 을 **한 건도 받을 수 없었다**
 * (SR 생성 폼이 카테고리를 하드 요구하고 스키마도 non-nullable). 백엔드는 있었지만
 * 앱에서 호출하는 곳이 없어, 유일한 해결책이 curl 이나 수동 DB insert 였다(감사 3.18).
 */
export function ServiceCategoryDialog({
  open,
  onOpenChange,
  clientId,
  category,
  onSaved,
}: ServiceCategoryDialogProps) {
  const [categoryName, setCategoryName] = useState('');
  const [description, setDescription] = useState('');
  const [slaHours, setSlaHours] = useState(DEFAULT_SLA_HOURS);
  const [priority, setPriority] = useState<string>('MEDIUM');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isEditMode = category !== null;

  useEffect(() => {
    if (!open) return;

    if (category) {
      setCategoryName(category.categoryName);
      setDescription(category.description || '');
      setSlaHours(String(category.slaHours));
      setPriority(category.priority || 'MEDIUM');
    } else {
      setCategoryName('');
      setDescription('');
      setSlaHours(DEFAULT_SLA_HOURS);
      setPriority('MEDIUM');
    }
  }, [open, category]);

  /**
   * 생성/수정 저장.
   *
   * url·method 를 `isEditMode` 로 **동시에** 분기하던 것을 `apiPost`/`apiPatch` 두 갈래로
   * 나눴다. `category` 를 그대로 좁히므로 `category!.id` 같은 단언이 필요 없다
   * (`isEditMode` 는 `category !== null` 이다).
   *
   * `clientId` 는 **prop 으로 받은 값**만 쓴다 — 라우트도 URL 의 id 만 신뢰하고 본문 값은
   * 무시하므로, 양쪽이 같은 규칙이어야 경로가 어긋나지 않는다.
   */
  const saveCategory = useMutation({
    mutationFn: (payload: CategoryPayload) =>
      category
        ? apiPatch<unknown>(`/api/clients/${clientId}/categories/${category.id}`, payload, {
            fallbackMessage: SAVE_ERROR_MESSAGE,
          })
        : apiPost<unknown>(`/api/clients/${clientId}/categories`, payload, {
            fallbackMessage: SAVE_ERROR_MESSAGE,
          }),
    onSuccess: () => {
      toast({
        title: '성공',
        description: isEditMode
          ? '서비스 카테고리가 수정되었습니다.'
          : '서비스 카테고리가 등록되었습니다.',
      });
      // 순서(토스트 → onSaved → 닫기)는 예전과 같다. 부모가 이 콜백으로 재조회한다.
      onSaved();
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : SAVE_ERROR_MESSAGE,
        variant: 'destructive',
      });
      // 닫지 않는다. 입력한 내용을 잃지 않고 고쳐서 다시 보낼 수 있어야 한다.
    },
    onSettled: () => {
      /**
       * 카테고리는 지금 고객사 상세(`qk.clients.detail`)가 함께 실어 오고,
       * 앞으로 별도 조회로 떨어져 나갈 자리가 `qk.clients.categories` 다. 두 키를 모두
       * 무효화해 둔다 — 등록된 쿼리가 없는 키는 무동작이라 지금 넣어도 요청이 늘지 않는다.
       *
       * ⚠️ `cancelRefetch: false` 가 핵심이다. 바로 위 `onSuccess` 의 `onSaved()` 가 부모의
       * `refetch()` 를 이미 띄워 놨는데, `invalidateQueries` 의 기본값(`cancelRefetch: true`)은
       * **진행 중인 그 요청을 취소하고 새로 건다.** 그러면 저장 한 번에 상세 조회가 두 번
       * 나가고 한 번은 버려진다. false 로 두면 진행 중인 재조회에 합류해 정확히 한 번이 된다.
       * (부모가 `onSaved` 를 버리고 무효화만 남기면 이 호출이 그대로 재조회를 일으킨다.)
       */
      const joinInFlight = { cancelRefetch: false };
      queryClient.invalidateQueries({ queryKey: qk.clients.categories(clientId) }, joinInFlight);
      queryClient.invalidateQueries({ queryKey: qk.clients.detail(clientId) }, joinInFlight);
    },
  });

  const loading = saveCategory.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!categoryName.trim()) {
      toast({ title: '오류', description: '카테고리명을 입력해주세요.', variant: 'destructive' });
      return;
    }

    // SLA 는 마감일 계산에 직접 쓰이므로 서버가 거절하기 전에 여기서 걸러 준다.
    // (mutation 밖에 남긴다 — 여기서 막힌 제출은 pending 상태를 스치지 않아야 한다.)
    const parsedSlaHours = Number(slaHours);
    if (!Number.isInteger(parsedSlaHours) || parsedSlaHours <= 0) {
      toast({
        title: '오류',
        description: 'SLA 시간은 1 이상의 정수여야 합니다.',
        variant: 'destructive',
      });
      return;
    }

    saveCategory.mutate({
      categoryName: categoryName.trim(),
      // 빈 문자열을 보내면 서버가 그것으로 덮어써 기존 설명이 지워진다.
      description: description.trim() || undefined,
      slaHours: parsedSlaHours,
      priority,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEditMode ? '서비스 카테고리 수정' : '서비스 카테고리 추가'}
            </DialogTitle>
            <DialogDescription>
              카테고리는 SR 접수 시 선택 항목이며, SLA 시간이 마감일 계산에 사용됩니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="categoryName">카테고리명 *</Label>
              <Input
                id="categoryName"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="예: 일반 요청"
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">설명</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="선택 입력"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slaHours">SLA 시간 *</Label>
              <Input
                id="slaHours"
                type="number"
                min={1}
                step={1}
                value={slaHours}
                onChange={(e) => setSlaHours(e.target.value)}
                required
                disabled={loading}
                aria-describedby="slaHours-help"
              />
              <p id="slaHours-help" className="text-xs text-muted-foreground">
                접수 시점부터 이 시간 안에 처리해야 합니다. 마감일이 이 값으로 계산됩니다.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">기본 우선순위 *</Label>
              <Select value={priority} onValueChange={setPriority} disabled={loading}>
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              취소
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? '저장 중...' : isEditMode ? '수정' : '추가'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
