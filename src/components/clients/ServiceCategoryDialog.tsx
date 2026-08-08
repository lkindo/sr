'use client';

import { useEffect, useState } from 'react';

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
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!categoryName.trim()) {
      toast({ title: '오류', description: '카테고리명을 입력해주세요.', variant: 'destructive' });
      return;
    }

    // SLA 는 마감일 계산에 직접 쓰이므로 서버가 거절하기 전에 여기서 걸러 준다.
    const parsedSlaHours = Number(slaHours);
    if (!Number.isInteger(parsedSlaHours) || parsedSlaHours <= 0) {
      toast({
        title: '오류',
        description: 'SLA 시간은 1 이상의 정수여야 합니다.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const url = isEditMode
        ? `/api/clients/${clientId}/categories/${category.id}`
        : `/api/clients/${clientId}/categories`;

      const response = await fetch(url, {
        method: isEditMode ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryName: categoryName.trim(),
          description: description.trim() || undefined,
          slaHours: parsedSlaHours,
          priority,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || '저장에 실패했습니다.');
      }

      toast({
        title: '성공',
        description: isEditMode
          ? '서비스 카테고리가 수정되었습니다.'
          : '서비스 카테고리가 등록되었습니다.',
      });
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : '저장에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
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
