import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

import { getClientsForSelection } from '@/actions/client.actions';
import { getServiceCategoriesForSelection } from '@/actions/service-category.actions';
import { getProfileAction } from '@/actions/user.actions';
import { usePermissions } from '@/hooks/use-permissions';
import { useUpdateSR } from '@/hooks/use-sr';
import { useToast } from '@/hooks/use-toast';

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
  sr: any;
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
  const [existingAttachments, setExistingAttachments] = useState<Attachment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
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
        const userClients = (profileResult.data as any).clients || [];
        if (userClients.length > 0) {
          const userClient = userClients[0].client;
          setClients([{ id: userClient.id, code: userClient.code, name: userClient.name }]);
          if (sr?.clientId) setClientId(sr.clientId);
        }
      }
    } else {
      const result = await getClientsForSelection();
      if (result.success) setClients(result.data as Client[]);
    }
  }, [isClientUser, sr?.clientId]);

  const fetchCategories = useCallback(async () => {
    const result = await getServiceCategoriesForSelection();
    if (result.success && result.data) {
      setCategories(result.data.map((cat) => ({ id: cat.id, categoryName: cat.categoryName })));
    } else {
      toast({
        title: '오류',
        description: '서비스 카테고리 목록을 불러오지 못했습니다.',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const fetchExistingAttachments = useCallback(async (srId: string) => {
    try {
      const response = await fetch(`/api/srs/${srId}`);
      if (response.ok) {
        const data = await response.json();
        setExistingAttachments(data.attachments || []);
      }
    } catch {
      // ignore
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
        ? new Date(sr.requestedCompletionDate).toISOString().split('T')[0]
        : ''
    );
    setFiles([]);

    if (sr.attachments && sr.attachments.length > 0) {
      setExistingAttachments(sr.attachments);
    } else {
      fetchExistingAttachments(sr.id);
    }
    fetchClients();
    fetchCategories();
  }, [open, srId]);

  const handleDeleteAttachmentClick = (attachmentId: string) => setFileToDelete(attachmentId);

  const executeDeleteAttachment = async () => {
    if (!fileToDelete) return;
    const attachmentId = fileToDelete;
    setFileToDelete(null);

    try {
      const response = await fetch(`/api/attachments/${attachmentId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('파일 삭제 실패');
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
        description: 'SR은 수정되었으나 첨부파일 업로드에 실패했습니다.',
        variant: 'destructive',
      });
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
      if (files.length > 0) {
        await uploadAttachments(sr.id, files);
        await fetchExistingAttachments(sr.id);
      }

      toast({ title: '성공', description: 'SR이 수정되었습니다.' });
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
