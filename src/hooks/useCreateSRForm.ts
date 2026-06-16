import { useCallback, useEffect, useState } from 'react';

import { getClientsForSelection } from '@/actions/client.actions';
import { getServiceCategoriesForSelection } from '@/actions/service-category.actions';
import { createSRAction } from '@/actions/sr.actions';
import { getProfileAction } from '@/actions/user.actions';
import { usePermissions } from '@/hooks/use-permissions';
import { useToast } from '@/hooks/use-toast';

const MIN_TITLE_LENGTH = 5;
const MIN_DESCRIPTION_LENGTH = 10;

interface Client {
  id: string;
  code: string;
  name: string;
}

export function useCreateSRForm({ onCreated, open }: { onCreated: () => void; open: boolean }) {
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
  const { hasAnyRole } = usePermissions();

  const isClientUser = !hasAnyRole(['ADMIN', 'MANAGER', 'ENGINEER']);
  const canSelectClient = hasAnyRole(['ADMIN', 'MANAGER', 'ENGINEER']);

  const fetchClients = useCallback(async () => {
    if (isClientUser) {
      const profileResult = await getProfileAction();
      if (profileResult.success && profileResult.data) {
        const userClients = (profileResult.data as any).clients || [];
        if (userClients.length > 0) {
          const userClient = userClients[0].client;
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

  useEffect(() => {
    if (open) {
      setTitle('');
      setDescription('');
      if (!isClientUser) setClientId('');
      setCategoryId('');
      setRequestedPriority('MEDIUM');
      setRequestedCompletionDate('');
      setFiles([]);
      fetchClients();
      fetchCategories();
    }
  }, [open, isClientUser, fetchClients, fetchCategories]);

  useEffect(() => {
    if (open && isClientUser && clients.length > 0 && !clientId) {
      setClientId(clients[0].id);
    }
  }, [open, isClientUser, clients, clientId]);

  const uploadAttachments = async (srId: string, filesToUpload: File[]) => {
    const formData = new FormData();
    filesToUpload.forEach((file) => formData.append('files', file));
    try {
      const response = await fetch(`/api/srs/${srId}/attachments`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) throw new Error('Failed to upload attachments');
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
      if (files.length > 0) await uploadAttachments(createdSR.id, files);

      toast({
        title: '성공',
        description: `SR이 생성되었습니다.${files.length > 0 ? ` (첨부파일 ${files.length}개 업로드)` : ''}`,
      });
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
