import { useCallback, useEffect, useState } from 'react';

import { getClientsForSelection } from '@/actions/client.actions';
import { getServiceCategoriesForSelection } from '@/actions/service-category.actions';
import { createSRAction } from '@/actions/sr.actions';
import { getProfileAction } from '@/actions/user.actions';
import { usePermissions } from '@/hooks/use-permissions';
import { useToast } from '@/hooks/use-toast';
import { apiPost } from '@/lib/api-client';
import type { ClientSummary } from '@/types/client.types';

const MIN_TITLE_LENGTH = 5;
const MIN_DESCRIPTION_LENGTH = 10;

export function useCreateSRForm({ onCreated, open }: { onCreated: () => void; open: boolean }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [clientId, setClientId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [requestedPriority, setRequestedPriority] = useState<string>('MEDIUM');
  const [requestedCompletionDate, setRequestedCompletionDate] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { hasAnyRole } = usePermissions();

  const isClientUser = !hasAnyRole(['ADMIN', 'MANAGER', 'ENGINEER']);
  const canSelectClient = hasAnyRole(['ADMIN', 'MANAGER', 'ENGINEER']);

  const fetchClients = useCallback(async () => {
    if (isClientUser) {
      const profileResult = await getProfileAction();
      if (profileResult.success && profileResult.data) {
        const userClient = (profileResult.data.clients ?? [])[0]?.client;
        if (userClient) {
          setClients([{ id: userClient.id, code: userClient.code, name: userClient.name }]);
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
        toast({ title: '오류', description: errorMsg, variant: 'destructive' });
      }
    } else {
      const result = await getClientsForSelection();
      if (result.success) {
        setClients(result.data as ClientSummary[]);
      } else {
        toast({
          title: '오류',
          description: '고객사 목록을 불러오지 못했습니다.',
          variant: 'destructive',
        });
      }
    }
  }, [toast, isClientUser]);

  // 카테고리는 반드시 선택된 고객사로 스코프한다.
  // 스코프가 없으면 드롭다운에 **다른 고객사의 서비스 카탈로그**가 그대로 나오고,
  // 잘못 고르면 그 카테고리의 SLA 가 이 SR 의 마감일 계산에 쓰인다(감사 3.19).
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
        setCategories(result.data.map((cat) => ({ id: cat.id, name: cat.categoryName })));
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

  useEffect(() => {
    if (open) {
      setTitle('');
      setDescription('');
      if (!isClientUser) setClientId('');
      setCategoryId('');
      setRequestedPriority('MEDIUM');
      setRequestedCompletionDate('');
      setFiles([]);
      setCategories([]);
      fetchClients();
    }
  }, [open, isClientUser, fetchClients]);

  useEffect(() => {
    const firstClient = clients[0];
    if (open && isClientUser && firstClient && !clientId) {
      setClientId(firstClient.id);
    }
  }, [open, isClientUser, clients, clientId]);

  // 고객사가 정해지거나 바뀌면 카테고리를 다시 불러오고, 이전 선택은 버린다.
  // (바뀐 고객사에 존재하지 않는 카테고리 id 가 그대로 제출되는 것을 막는다)
  useEffect(() => {
    if (!open) return;
    setCategoryId('');
    fetchCategories(clientId);
  }, [open, clientId, fetchCategories]);

  /**
   * 배치 업로드 결과. `uploaded` 는 **서버에 실제로 저장된** 개수다.
   *
   * POST /api/srs/[id]/attachments 는 부분 성공을 201 로 돌려준다 —
   * 검증에 걸린 파일은 `data.errors[]` 에 담기고 나머지만 저장된다.
   * (전부 실패한 경우에만 400 이다.)
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
      // ⚠️ FormData 를 그대로 넘긴다. `api-client` 가 이때 Content-Type 을 붙이지 않으므로
      //    브라우저가 multipart boundary 를 계산해 붙인다. 직접 헤더를 주면 서버가
      //    본문을 파싱하지 못한다.
      //
      // **성공 여부만 보고 끝내면 안 된다.** 예전에는 `response.ok` 만 확인하고 호출부가
      // **고른 파일 수**로 "첨부파일 N개 업로드" 를 띄웠다. 3개 중 2개가 확장자·크기 검증에
      // 걸려도 응답은 201 이므로 사용자에게는 3개 다 올라간 것으로 보였고, 상세를 열어야
      // 비로소 없다는 것을 알 수 있었다. 저장된 개수는 응답이 알려 준다.
      // (전부 실패한 경우에만 400 이고, 그때는 ApiError 가 던져져 아래 catch 로 간다.)
      const body = await apiPost<{
        data?: {
          attachments?: unknown[];
          errors?: Array<{ fileName: string; error: string }>;
        };
      }>(`/api/srs/${srId}/attachments`, formData);
      return {
        uploaded: body.data?.attachments?.length ?? 0,
        rejected: body.data?.errors ?? [],
      };
    } catch {
      toast({
        title: '경고',
        description: 'SR은 생성되었으나 첨부파일 업로드에 실패했습니다.',
        variant: 'destructive',
      });
      return { uploaded: 0, rejected: [] };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (title.length < MIN_TITLE_LENGTH) {
      toast({
        title: '오류',
        description: `제목은 최소 ${MIN_TITLE_LENGTH}자 이상이어야 합니다.`,
        variant: 'destructive',
      });
      return;
    }
    if (description.length < MIN_DESCRIPTION_LENGTH) {
      toast({
        title: '오류',
        description: `설명은 최소 ${MIN_DESCRIPTION_LENGTH}자 이상이어야 합니다.`,
        variant: 'destructive',
      });
      return;
    }
    if (!clientId || !categoryId) {
      toast({
        title: '오류',
        description: '고객사와 카테고리를 모두 선택해주세요.',
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
    if (requestedCompletionDate)
      formData.append('requestedCompletionDate', requestedCompletionDate);

    try {
      const result = await createSRAction(formData);
      if (!result.success) throw new Error(result.error || 'SR 생성에 실패했습니다.');

      const createdSR = result.data;
      const upload =
        files.length > 0
          ? await uploadAttachments(createdSR.id, files)
          : { uploaded: 0, rejected: [] };

      // 거부된 파일이 있으면 성공 토스트로 덮지 않고 사유를 그대로 보여 준다.
      // 사용자가 다시 올릴지 판단하려면 어떤 파일이 왜 걸렸는지가 필요하다.
      if (upload.rejected.length > 0) {
        toast({
          title: '일부 첨부파일이 업로드되지 않았습니다',
          description: `SR은 생성되었습니다. ${upload.uploaded}개 업로드 / ${upload.rejected.length}개 실패 — ${upload.rejected
            .map((r) => `${r.fileName}: ${r.error}`)
            .join(', ')}`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: '성공',
          description: `SR이 생성되었습니다.${upload.uploaded > 0 ? ` (첨부파일 ${upload.uploaded}개 업로드)` : ''}`,
        });
      }
      onCreated();
    } catch (error) {
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : 'SR 생성에 실패했습니다.',
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
      requestedCompletionDate,
      files,
      clients,
      categories,
      loading,
      canSelectClient,
    },
    actions: {
      setTitle,
      setDescription,
      setClientId,
      setCategoryId,
      setRequestedPriority,
      setRequestedCompletionDate,
      setFiles,
      handleSubmit,
    },
    constants: { MIN_TITLE_LENGTH, MIN_DESCRIPTION_LENGTH },
  };
}
