'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface SR {
  id: string;
  srNumber: string;
  title: string;
}

interface DeleteSRDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sr: SR | null;
  onDelete: (srId: string) => Promise<void>;
}

export function DeleteSRDialog({ open, onOpenChange, sr, onDelete }: DeleteSRDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!sr) return;

    setLoading(true);
    try {
      await onDelete(sr.id);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to delete SR:', error);
      // 에러 처리는 부모 컴포넌트나 훅에서 담당 (토스트 등)
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>SR 삭제</DialogTitle>
          <DialogDescription>
            정말로 <strong>{sr?.srNumber}</strong> - {sr?.title} SR을 삭제하시겠습니까?
            <br />이 작업은 되돌릴 수 없으며, 모든 댓글과 첨부파일도 함께 삭제됩니다.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            취소
          </Button>
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading ? '삭제 중...' : '삭제'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
