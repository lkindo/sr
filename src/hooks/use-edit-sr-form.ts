import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

import { getClientsForSelection } from '@/actions/client.actions';
import { getServiceCategoriesForSelection } from '@/actions/service-category.actions';
import { getProfileAction } from '@/actions/user.actions';
import type { EditableSR } from '@/components/srs/EditSRDialog';
import { usePermissions } from '@/hooks/use-permissions';
import { useUpdateSR } from '@/hooks/use-sr';
import { useToast } from '@/hooks/use-toast';
import { apiDelete, apiGet, apiPost } from '@/lib/api-client';
import type { ClientSummary } from '@/types/client.types';
import type { SRAttachmentView } from '@/types/sr.types';

interface ServiceCategory {
  id: string;
  categoryName: string;
}

export function useEditSRForm({
  sr,
  open,
  onOpenChange,
  onUpdated,
}: {
  sr: EditableSR;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [clientId, setClientId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [requestedPriority, setRequestedPriority] = useState<string>('MEDIUM');
  const [priority, setPriority] = useState('');
  const [status, setStatus] = useState('');
  const [requestedCompletionDate, setRequestedCompletionDate] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<SRAttachmentView[]>([]);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);

  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { hasAnyRole } = usePermissions();
  const { mutateAsync: updateSR } = useUpdateSR(sr?.id || '');

  const isClientUser = hasAnyRole(['CLIENT_ADMIN', 'CLIENT_USER']);
  const canSelectClient = hasAnyRole(['ADMIN', 'MANAGER', 'ENGINEER']);

  const fetchClients = useCallback(async () => {
    if (isClientUser) {
      const profileResult = await getProfileAction();
      if (profileResult.success && profileResult.data) {
        const userClient = (profileResult.data.clients ?? [])[0]?.client;
        if (userClient) {
          setClients([{ id: userClient.id, code: userClient.code, name: userClient.name }]);
          if (sr?.clientId) setClientId(sr.clientId);
        }
      }
    } else {
      // 이 SR 의 현재 고객사는 비활성이더라도 선택지에 남겨야 한다.
      // 그러지 않으면 비활성화된 고객사의 SR 을 수정하려고 열었을 때 셀렉트가
      // 빈 채로 뜬다(= 사용자가 손대지도 않은 값이 바뀐 것처럼 보인다).
      const result = await getClientsForSelection(sr?.clientId);
      if (result.success) setClients(result.data as ClientSummary[]);
    }
  }, [isClientUser, sr?.clientId]);

  // 생성 폼과 동일하게 선택된 고객사로 스코프한다(감사 3.19).
  const fetchCategories = useCallback(
    async (targetClientId: string) => {
      if (!targetClientId) {
        setCategories([]);
        return;
      }

      // 서버 액션이 던지는 경우(네트워크 단절, 5xx)도 사용자에게 보여야 한다.
      // 예전에는 `result.success === false` 만 처리해서, 실패의 절반이 조용히
      // 사라지고 카테고리 셀렉트만 비어 있는 채로 남았다.
      let result;
      try {
        result = await getServiceCategoriesForSelection(targetClientId);
      } catch {
        result = { success: false as const, data: undefined };
      }
      if (result.success && result.data) {
        setCategories(result.data.map((cat) => ({ id: cat.id, categoryName: cat.categoryName })));
      } else {
        setCategories([]);
        toast({
          title: '오류',
          description: '서비스 카테고리 목록을 불러오지 못했습니다.',
          variant: 'destructive',
        });
      }
    },
    [toast]
  );

  const fetchExistingAttachments = useCallback(async (srId: string) => {
    try {
      const data = await apiGet<{ attachments?: SRAttachmentView[] }>(`/api/srs/${srId}`);
      setExistingAttachments(data?.attachments || []);
    } catch {
      // ignore
      //
      // 실패를 삼키는 것이 의도다. 이 조회는 폼을 채우는 **보조** 경로다 —
      // 부모가 첨부 목록을 이미 넘겨줬으면 아예 부르지도 않는다. 여기서 토스트를 띄우면
      // 다이얼로그를 열 때마다 사용자가 요청하지도 않은 실패가 뜨고, 정작 수정 자체는
      // 정상 동작한다. 기존 목록은 비어 있는 채로 두고 조용히 넘어간다.
      // (이전에도 `response.ok` 가 아니면 아무것도 하지 않았다. ApiError 도 같게 다룬다.)
    }
  }, []);

  const srId = useMemo(() => sr?.id || '', [sr?.id]);

  useEffect(() => {
    if (!open || !sr) return;

    const isAdmin = hasAnyRole(['ADMIN']);
    if (sr.status !== 'REQUESTED' && !isAdmin) {
      toast({
        title: '알림',
        description: "SR 수정은 '요청됨' 상태인 경우에만 가능합니다.",
        variant: 'default',
      });
      onOpenChange(false);
      return;
    }

    setTitle(sr.title);
    setDescription(sr.description);
    setClientId(sr.clientId || sr.client?.id || '');
    setCategoryId(sr.serviceCategory?.id || sr.category?.id || '');
    setRequestedPriority(sr.requestedPriority || 'MEDIUM');
    setPriority(sr.actualPriority || 'MEDIUM');
    setStatus(sr.status);
    setRequestedCompletionDate(
      sr.requestedCompletionDate
        ? (new Date(sr.requestedCompletionDate).toISOString().split('T')[0] ?? '')
        : ''
    );
    setFiles([]);

    if (sr.attachments && sr.attachments.length > 0) {
      setExistingAttachments(sr.attachments);
    } else {
      fetchExistingAttachments(sr.id);
    }
    fetchClients();
    fetchCategories(sr.clientId || sr.client?.id || '');
    // 다이얼로그가 열릴 때 폼을 SR 값으로 한 번 채우는 초기화다.
    // sr 객체나 fetcher 를 deps 에 넣으면 사용자가 입력 중일 때 부모 리렌더마다
    // 폼이 서버 값으로 되돌아간다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, srId]);

  // 고객사를 바꾸면 카테고리를 다시 불러온다.
  // 초기 로드는 위 effect 가 처리하므로, 여기서는 "실제로 바뀐 경우"만 다룬다.
  const previousClientIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      previousClientIdRef.current = null;
      return;
    }
    if (previousClientIdRef.current === null) {
      previousClientIdRef.current = clientId;
      return;
    }
    if (previousClientIdRef.current === clientId) return;

    previousClientIdRef.current = clientId;
    // 바뀐 고객사에 없는 카테고리 id 가 그대로 제출되지 않도록 선택을 비운다.
    setCategoryId('');
    fetchCategories(clientId);
  }, [open, clientId, fetchCategories]);

  const handleDeleteAttachmentClick = (attachmentId: string) => setFileToDelete(attachmentId);

  const executeDeleteAttachment = async () => {
    if (!fileToDelete) return;
    const attachmentId = fileToDelete;
    setFileToDelete(null);

    try {
      await apiDelete(`/api/attachments/${attachmentId}`, { fallbackMessage: '파일 삭제 실패' });
      setExistingAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
      toast({ title: '성공', description: '파일이 삭제되었습니다.' });
    } catch (error) {
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : '파일 삭제에 실패했습니다.',
        variant: 'destructive',
      });
    }
  };

  /**
   * 배치 업로드 결과. `uploaded` 는 **서버에 실제로 저장된** 개수다.
   *
   * POST /api/srs/[id]/attachments 는 부분 성공을 201 로 돌려준다 —
   * 검증에 걸린 파일은 `data.errors[]` 에 담기고 나머지만 저장된다.
   * (전부 실패한 경우에만 400 이다.)
   *
   * 생성 폼(`use-create-sr-form.ts`)과 **동일한 계약**이다. 두 폼이 같은 라우트를
   * 부르므로 결과를 다루는 방식도 갈라지면 안 된다.
   */
  interface AttachmentUploadOutcome {
    uploaded: number;
    rejected: Array<{ fileName: string; error: string }>;
  }

  const uploadAttachments = async (
    srId: string,
    filesToUpload: File[]
  ): Promise<AttachmentUploadOutcome> => {
    const formData = new FormData();
    filesToUpload.forEach((file) => formData.append('files', file));
    try {
      // ⚠️ FormData 는 그대로 넘긴다 — `api-client` 가 Content-Type 을 붙이지 않아야
      //    브라우저가 multipart boundary 를 계산해 붙인다.
      //
      // **던지지 않았다고 다 올라간 것이 아니다.** 예전에는 `await apiPost(...)` 만 하고
      // 응답을 아예 읽지 않았다. 3개 중 2개가 확장자·크기 검증에 걸려도 응답은 201 이므로
      // 사용자에게는 "SR이 수정되었습니다." 만 보였고, 상세를 다시 열어야 비로소 파일이
      // 없다는 것을 알 수 있었다. 저장된 개수와 거부 사유는 응답이 알려 준다.
      // (생성 폼에서 이미 한 번 고쳤던 회귀가 수정 폼에 남아 있었다.)
      const body = await apiPost<{
        data?: {
          attachments?: unknown[];
          errors?: Array<{ fileName: string; error: string }>;
        };
      }>(`/api/srs/${srId}/attachments`, formData);
      return {
        uploaded: body?.data?.attachments?.length ?? 0,
        rejected: body?.data?.errors ?? [],
      };
    } catch {
      // 전부 실패(400)·네트워크 오류. 여기서만 "업로드에 실패했습니다" 를 띄운다.
      toast({
        title: '경고',
        description: 'SR은 수정되었으나 첨부파일 업로드에 실패했습니다.',
        variant: 'destructive',
      });
      return { uploaded: 0, rejected: [] };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const isAdmin = hasAnyRole(['ADMIN']);
    if (sr.status !== 'REQUESTED' && !isAdmin) {
      toast({
        title: '오류',
        description: "SR 수정은 '요청됨' 상태인 경우에만 가능합니다.",
        variant: 'destructive',
      });
      return;
    }
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

    setLoading(true);

    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    formData.append('status', status);
    if (priority && priority.trim() !== '') formData.append('priority', priority);
    formData.append('serviceCategoryId', categoryId || '');
    if (requestedPriority && requestedPriority.trim() !== '')
      formData.append('requestedPriority', requestedPriority);
    if (requestedCompletionDate)
      formData.append('requestedCompletionDate', requestedCompletionDate);

    try {
      await updateSR(formData);

      let upload: AttachmentUploadOutcome = { uploaded: 0, rejected: [] };
      if (files.length > 0) {
        upload = await uploadAttachments(sr.id, files);
        await fetchExistingAttachments(sr.id);
      }

      // 거부된 파일이 있으면 성공 토스트로 덮지 않고 사유를 그대로 보여 준다.
      // 사용자가 다시 올릴지 판단하려면 어떤 파일이 왜 걸렸는지가 필요하다.
      if (upload.rejected.length > 0) {
        toast({
          title: '일부 첨부파일이 업로드되지 않았습니다',
          description: `SR은 수정되었습니다. ${upload.uploaded}개 업로드 / ${upload.rejected.length}개 실패 — ${upload.rejected
            .map((r) => `${r.fileName}: ${r.error}`)
            .join(', ')}`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: '성공',
          description: `SR이 수정되었습니다.${upload.uploaded > 0 ? ` (첨부파일 ${upload.uploaded}개 업로드)` : ''}`,
        });
      }
      onOpenChange(false);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sr', sr.id] }),
        Promise.resolve(router.refresh()),
      ]);
      onUpdated();
    } catch (error) {
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : 'SR 수정에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return {
    state: {
      title,
      description,
      clientId,
      categoryId,
      requestedPriority,
      priority,
      status,
      requestedCompletionDate,
      files,
      existingAttachments,
      clients,
      categories,
      loading,
      fileToDelete,
      canSelectClient,
    },
    actions: {
      setTitle,
      setDescription,
      setClientId,
      setCategoryId,
      setRequestedPriority,
      setPriority,
      setStatus,
      setRequestedCompletionDate,
      setFiles,
      setFileToDelete,
      handleDeleteAttachmentClick,
      executeDeleteAttachment,
      handleSubmit,
    },
  };
}
