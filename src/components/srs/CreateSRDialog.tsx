'use client';

import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useState } from 'react';

import { getClientsForSelection } from '@/actions/client.actions';
import { getServiceCategoriesForSelection } from '@/actions/service-category.actions';
import { createSRAction } from '@/actions/sr.actions';
import { getProfileAction } from '@/actions/user.actions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FileUpload } from '@/components/ui/file-upload';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { usePermissions } from '@/hooks/use-permissions';
import { useToast } from '@/hooks/use-toast';

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
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [clientId, setClientId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [requestedPriority, setRequestedPriority] = useState<string>('MEDIUM');
  const [requestedCompletionDate, setRequestedCompletionDate] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { data: session } = useSession();
  const { hasAnyRole } = usePermissions();

  // ADMIN, MANAGER, ENGINEER가 아닌 고객사 사용자인지 확인
  const isClientUser = !hasAnyRole(['ADMIN', 'MANAGER', 'ENGINEER']);
  const canSelectClient = hasAnyRole(['ADMIN', 'MANAGER', 'ENGINEER']);

  const fetchClients = useCallback(async () => {
    // 고객사 사용자인 경우 자신의 고객사만 가져오기
    if (isClientUser) {
      const profileResult = await getProfileAction();

      if (profileResult.success && profileResult.data) {
        const userClients =
          (
            profileResult.data as {
              clients?: Array<{ client: { id: string; code: string; name: string } }>;
            }
          ).clients || [];

        if (userClients.length > 0) {
          // 첫 번째 고객사 사용 (일반적으로 사용자는 하나의 고객사에만 속함)
          const userClient = userClients[0].client;
          setClients([
            {
              id: userClient.id,
              code: userClient.code,
              name: userClient.name,
            },
          ]);
          // 자동으로 고객사 설정
          setClientId(userClient.id);
        } else {
          toast({
            title: '오류',
            description: '고객사 정보를 찾을 수 없습니다.',
            variant: 'destructive',
          });
        }
      } else {
        const errorMsg =
          profileResult.success === false
            ? profileResult.error
            : '사용자 정보를 불러오지 못했습니다.';
        toast({
          title: '오류',
          description: errorMsg,
          variant: 'destructive',
        });
      }
    } else {
      // ADMIN, MANAGER, ENGINEER인 경우 모든 고객사 가져오기
      const result = await getClientsForSelection();

      if (result.success) {
        setClients(result.data as Client[]);
      } else {
        toast({
          title: '오류',
          description: '고객사 목록을 불러오지 못했습니다.',
          variant: 'destructive',
        });
      }
    }
  }, [toast, isClientUser]);

  const fetchCategories = useCallback(async () => {
    const result = await getServiceCategoriesForSelection();
    if (result.success && result.data) {
      setCategories(result.data.map((cat) => ({ id: cat.id, name: cat.categoryName })));
    } else {
      toast({
        title: '오류',
        description: '서비스 카테고리 목록을 불러오지 못했습니다.',
        variant: 'destructive',
      });
    }
  }, [toast]);

  // 다이얼로그가 열릴 때마다 폼 초기화 (고객사 제외)
  useEffect(() => {
    if (open) {
      setTitle('');
      setDescription('');
      // 고객사 사용자가 아닌 경우에만 clientId 초기화
      if (!isClientUser) {
        setClientId('');
      }
      setCategoryId('');
      setRequestedPriority('MEDIUM');
      setRequestedCompletionDate('');
      setFiles([]);
    }
  }, [open, isClientUser]);

  useEffect(() => {
    if (open) {
      fetchClients();
      fetchCategories(); // 전체 서비스 카테고리 조회
    }
  }, [open, fetchClients, fetchCategories]);

  // 고객사 사용자인 경우 고객사 자동 설정 (fetchClients 완료 후)
  useEffect(() => {
    if (open && isClientUser && clients.length > 0 && !clientId) {
      setClientId(clients[0].id);
    }
  }, [open, isClientUser, clients, clientId]);

  const uploadAttachments = async (srId: string, files: File[]) => {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });

    try {
      const response = await fetch(`/api/srs/${srId}/attachments`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        await response.text();
        throw new Error('Failed to upload attachments');
      }

      await response.json();
    } catch {
      toast({
        title: '경고',
        description: 'SR은 생성되었으나 첨부파일 업로드에 실패했습니다.',
        variant: 'destructive',
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (title.length < 5) {
      toast({
        title: '오류',
        description: '제목은 최소 5자 이상이어야 합니다.',
        variant: 'destructive',
      });
      return;
    }

    if (description.length < 10) {
      toast({
        title: '오류',
        description: '설명은 최소 10자 이상이어야 합니다.',
        variant: 'destructive',
      });
      return;
    }

    if (!clientId) {
      toast({
        title: '오류',
        description: '고객사를 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }

    if (!categoryId) {
      toast({
        title: '오류',
        description: '서비스 카테고리를 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    formData.append('clientId', clientId);
    formData.append('serviceCategoryId', categoryId);
    formData.append('requestedPriority', requestedPriority);
    if (requestedCompletionDate) {
      formData.append('requestedCompletionDate', requestedCompletionDate);
    }

    try {
      const result = await createSRAction(formData);

      if (!result.success) {
        throw new Error(result.error || 'SR 생성에 실패했습니다.');
      }

      const createdSR = result.data;

      // Upload attachments if any
      if (files.length > 0) {
        await uploadAttachments(createdSR.id, files);
      }

      toast({
        title: '성공',
        description: `SR이 생성되었습니다.${files.length > 0 ? ` (첨부파일 ${files.length}개 업로드)` : ''}`,
      });

      // Reset form
      setTitle('');
      setDescription('');
      setClientId('');
      setCategoryId('');
      setRequestedPriority('MEDIUM');
      setRequestedCompletionDate('');
      setFiles([]);

      onCreated();
    } catch (error) {
      let errorMessage = 'SR 생성에 실패했습니다.';

      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'object' && error !== null && 'message' in error) {
        errorMessage = String(error.message);
      }

      toast({
        title: '오류',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

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
            <Button type="submit" disabled={loading}>
              {loading ? '요청 중...' : '저장'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
