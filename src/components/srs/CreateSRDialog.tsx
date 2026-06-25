'use client';

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
import { useCreateSRForm } from '@/hooks/useCreateSRForm';

const MIN_TITLE_LENGTH = 5;
const MIN_DESCRIPTION_LENGTH = 10;

interface Client {
  id: string;
  code: string;
  name: string;
  categories?: {
    id: string;
    name: string;
  }[];
}

interface CreateSRDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateSRDialog({ open, onOpenChange, onCreated }: CreateSRDialogProps) {
  const { state, actions, constants } = useCreateSRForm({ onCreated, open });
  const {
    title,
    description,
    clientId,
    categoryId,
    requestedPriority,
    requestedCompletionDate,
    files,
    clients,
    categories,
    loading,
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
    handleSubmit,
  } = actions;
  const { MIN_TITLE_LENGTH, MIN_DESCRIPTION_LENGTH } = constants;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>새 SR 요청</DialogTitle>
          <DialogDescription>
            서비스 요청(SR)을 등록합니다. 제목, 설명, 고객사, 서비스 카테고리는 필수입니다.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} data-testid="sr-form">
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">제목 *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`SR 제목을 입력하세요 (최소 ${MIN_TITLE_LENGTH}자)`}
                required
                disabled={loading}
              />
              <div
                className={`text-xs text-right mt-1 ${
                  title.length > 0 && title.length < MIN_TITLE_LENGTH
                    ? 'text-red-500 font-medium'
                    : 'text-muted-foreground'
                }`}
              >
                {title.length}자 (최소 {MIN_TITLE_LENGTH}자)
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">설명 *</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={`SR 상세 내용을 입력하세요 (최소 ${MIN_DESCRIPTION_LENGTH}자)`}
                required
                disabled={loading}
                rows={5}
              />
              <div
                className={`text-xs text-right mt-1 ${
                  description.length > 0 && description.length < MIN_DESCRIPTION_LENGTH
                    ? 'text-red-500 font-medium'
                    : 'text-muted-foreground'
                }`}
              >
                {description.length}자 (최소 {MIN_DESCRIPTION_LENGTH}자)
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <p className="text-xs text-muted-foreground">고객사는 자동으로 설정됩니다.</p>
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
                        categories.length === 0 ? '카테고리가 없습니다' : '카테고리를 선택'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <FileUpload
                value={files}
                onChange={setFiles}
                maxSize={10}
                maxFiles={5}
                disabled={loading}
              />
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
            <Button type="submit" isLoading={loading}>
              저장
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
