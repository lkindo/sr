'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Eye, FileIcon, RefreshCw, Trash2, Upload } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

interface Attachment {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  fileUrl: string;
  createdAt: string;
}

interface SRAttachmentsProps {
  srId: string;
  canDelete?: boolean;
}

export function SRAttachments({ srId, canDelete = false }: SRAttachmentsProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const fetchAttachments = useCallback(async () => {
    try {
      setLoading(true);
      // SR 전체 정보가 아니라 첨부파일 목록만 조회하는 전용 API 사용
      const response = await fetch(`/api/srs/${srId}/attachments`);
      if (!response.ok) throw new Error('Failed to fetch attachments');
      const data = await response.json();

      setAttachments(data || []);
    } catch {
      toast({
        title: '오류',
        description: '첨부파일을 불러오는데 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [srId, toast]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];

    // 파일 크기 검증 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: '오류',
        description: '파일 크기는 10MB를 초과할 수 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('srId', srId);

      const response = await fetch('/api/attachments', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '파일 업로드 실패');
      }

      const newAttachment = await response.json();
      setAttachments([newAttachment, ...attachments]);

      toast({
        title: '성공',
        description: '파일이 업로드되었습니다.',
      });

      // 입력 필드 초기화
      event.target.value = '';
    } catch (error) {
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : '파일 업로드에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const [fileToDelete, setFileToDelete] = useState<string | null>(null);

  const handleDeleteClick = (attachmentId: string) => {
    setFileToDelete(attachmentId);
  };

  const executeDelete = async () => {
    if (!fileToDelete) return;

    const attachmentId = fileToDelete;
    setFileToDelete(null);

    try {
      const response = await fetch(`/api/attachments/${attachmentId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('파일 삭제 실패');
      }

      setAttachments(attachments.filter((a) => a.id !== attachmentId));

      toast({
        title: '성공',
        description: '파일이 삭제되었습니다.',
      });
    } catch {
      toast({
        title: '오류',
        description: '파일 삭제에 실패했습니다.',
        variant: 'destructive',
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>첨부파일</CardTitle>
          <CardDescription>로딩 중...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>첨부파일</CardTitle>
            <CardDescription>{attachments.length}개의 파일</CardDescription>
          </div>
          <div>
            <input
              type="file"
              id="file-upload"
              className="hidden"
              onChange={handleFileUpload}
              disabled={uploading}
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchAttachments}
                disabled={loading || uploading}
                title="새로고침"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => document.getElementById('file-upload')?.click()}
                disabled={uploading}
              >
                <Upload className="mr-2 h-4 w-4" />
                {uploading ? '업로드 중...' : '파일 업로드'}
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {attachments.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">첨부파일이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <FileIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{attachment.fileName}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatFileSize(attachment.fileSize)} •{' '}
                      {new Date(attachment.createdAt).toLocaleDateString('ko-KR')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(attachment.fileUrl, '_blank')}
                    title="미리보기"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      try {
                        const response = await fetch(attachment.fileUrl);
                        const blob = await response.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = attachment.fileName;
                        document.body.appendChild(a);
                        a.click();
                        window.URL.revokeObjectURL(url);
                        document.body.removeChild(a);
                      } catch {
                        // 다운로드 실패 시 새 탭에서 열기
                        window.open(attachment.fileUrl, '_blank');
                      }
                    }}
                    title="다운로드"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteClick(attachment.id)}
                      title="삭제"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

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
              onClick={executeDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
