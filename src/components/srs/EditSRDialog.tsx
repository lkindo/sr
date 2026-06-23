'use client';

import { Download, FileIcon, Trash2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui';
import { Button } from '@/components/ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui';
import { FileUpload } from '@/components/ui';
import { Input } from '@/components/ui';
import { Label } from '@/components/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { Textarea } from '@/components/ui';
import { useEditSRForm } from '@/hooks/useEditSRForm';

interface Client {
  id: string;
  code: string;
  name: string;
}

interface Attachment {
  id: string;
  fileName: string;
  fileSize: number | bigint;
  fileType: string;
  fileUrl: string;
  createdAt: Date | string;
}

interface SR {
  id: string;
  title: string;
  description: string;
  status: string;
  actualPriority: string | null;
  requestedPriority?: string | null;
  requestedCompletionDate?: Date | null | string;
  estimatedCompletionDate?: Date | null | string;
  dueDate?: Date | null | string;
  completedAt?: Date | null;
  expectedCompletionDate?: Date | null | string;
  clientId?: string;
  client?: {
    id: string;
    code: string;
    name: string;
  };
  assignedTo?: {
    id: string;
  } | null;
  category?: {
    id: string;
    name: string;
  } | null;
  serviceCategory?: {
    id: string;
    categoryName: string;
  } | null;
  attachments?: Attachment[];
}

interface ServiceCategory {
  id: string;
  categoryName: string;
}

interface EditSRDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sr: SR;
  onUpdated: () => void;
}

export function EditSRDialog({ open, onOpenChange, sr, onUpdated }: EditSRDialogProps) {
  const { state, actions } = useEditSRForm({ sr, open, onOpenChange, onUpdated });
  const {
    title,
    description,
    clientId,
    categoryId,
    requestedPriority,
    requestedCompletionDate,
    files,
    existingAttachments,
    clients,
    categories,
    loading,
    fileToDelete,
    canSelectClient,
  } = state;
  const {
    setTitle,
    setDescription,
    setClientId,
    setCategoryId,
    setRequestedPriority,
    setRequestedCompletionDate,
    setFiles,
    setFileToDelete,
    handleDeleteAttachmentClick,
    executeDeleteAttachment,
    handleSubmit,
  } = actions;

  const formatFileSize = (bytes: number | bigint) => {
    const numBytes = Number(bytes);
    if (numBytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(numBytes) / Math.log(k));
    return Math.round((numBytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>SR 수정</DialogTitle>
          <DialogDescription>
            SR 정보를 수정합니다. 제목, 설명, 고객사, 서비스 카테고리는 필수입니다.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} data-testid="edit-sr-form">
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">제목 *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="SR 제목을 입력하세요 (최소 5자)"
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">설명 *</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="SR 상세 내용을 입력하세요 (최소 10자)"
                required
                disabled={loading}
                rows={5}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="client">고객사 *</Label>
                <Select
                  value={clientId}
                  onValueChange={setClientId}
                  disabled={loading || !canSelectClient}
                >
                  <SelectTrigger id="client">
                    <SelectValue placeholder="고객사를 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name} ({client.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!canSelectClient && (
                  <p className="text-xs text-muted-foreground">고객사는 수정할 수 없습니다.</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">서비스 카테고리 *</Label>
                <Select
                  value={categoryId}
                  onValueChange={setCategoryId}
                  disabled={loading || categories.length === 0}
                >
                  <SelectTrigger id="category">
                    <SelectValue
                      placeholder={
                        categories.length === 0
                          ? '카테고리가 없습니다'
                          : categoryId
                            ? categories.find((c) => c.id === categoryId)?.categoryName ||
                              '카테고리를 선택'
                            : '카테고리를 선택'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.categoryName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="requestedPriority">희망 우선순위 *</Label>
                <Select
                  value={requestedPriority}
                  onValueChange={setRequestedPriority}
                  disabled={loading}
                >
                  <SelectTrigger id="requestedPriority">
                    <SelectValue placeholder="우선순위 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CRITICAL">긴급</SelectItem>
                    <SelectItem value="HIGH">높음</SelectItem>
                    <SelectItem value="MEDIUM">보통</SelectItem>
                    <SelectItem value="LOW">낮음</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="requestedCompletionDate">희망 완료일 (선택)</Label>
                <Input
                  id="requestedCompletionDate"
                  type="date"
                  value={requestedCompletionDate}
                  onChange={(e) => setRequestedCompletionDate(e.target.value)}
                  disabled={loading}
                  placeholder="언제까지 완료되길 원하시나요?"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>첨부파일 (선택사항)</Label>

              {/* 기존 첨부 파일 목록 */}
              {existingAttachments.length > 0 && (
                <div className="space-y-2 mb-4">
                  <Label className="text-sm text-muted-foreground">기존 첨부 파일</Label>
                  <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
                    {existingAttachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="flex items-center justify-between p-2 border rounded hover:bg-muted/50"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <FileIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{attachment.fileName}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatFileSize(attachment.fileSize)} •{' '}
                              {new Date(attachment.createdAt).toLocaleDateString('ko-KR')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(attachment.fileUrl, '_blank')}
                            disabled={loading}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteAttachmentClick(attachment.id)}
                            disabled={loading}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 새 파일 업로드 */}
              <div>
                <Label className="text-sm text-muted-foreground mb-2 block">
                  {existingAttachments.length > 0 ? '새 파일 추가' : '파일 업로드'}
                </Label>
                <FileUpload
                  value={files}
                  onChange={setFiles}
                  maxSize={10}
                  maxFiles={5}
                  disabled={loading}
                />
              </div>
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
              {loading ? '저장 중...' : '저장'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

      <AlertDialog open={!!fileToDelete} onOpenChange={(open) => !open && setFileToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>파일 삭제 확인</AlertDialogTitle>
            <AlertDialogDescription>
              정말로 이 첨부파일을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeDeleteAttachment}
              className="bg-destructive hover:bg-destructive/90"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
