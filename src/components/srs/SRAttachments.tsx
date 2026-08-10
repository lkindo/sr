'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
} from '@/components/ui';
import { Button } from '@/components/ui';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { useToast } from '@/hooks/use-toast';
import { apiDelete, apiGet, apiPost, retryUnlessClientError } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import type { SRAttachmentView } from '@/types/sr.types';

interface SRAttachmentsProps {
  srId: string;
  canDelete?: boolean;
}

/** 업로드 상한. 서버도 같은 값을 검사하지만, 왕복 전에 걸러 준다. */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * 조회 실패 시 쓰는 문구.
 *
 * 서버 메시지를 쓰지 않는 것은 의도다 — 이 카드는 실패 원인을 구분하지 않고 항상 같은
 * 문장을 낸다. React Query 로 옮기면서도 그 계약을 그대로 둔다.
 */
const LOAD_ERROR_MESSAGE = '첨부파일을 불러오는데 실패했습니다.';

/** 업로드 변이의 입력. `input` 은 성공 시 값을 비우기 위해 함께 들고 다닌다. */
interface UploadVariables {
  file: File;
  input: HTMLInputElement;
}

export function SRAttachments({ srId, canDelete = false }: SRAttachmentsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: attachments = [],
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: qk.sr.attachments(srId),
    // SR 전체 정보가 아니라 첨부파일 목록만 조회하는 전용 API 사용.
    // 이 라우트는 목록 봉투(`{data, meta}`)가 아니라 bare 배열을 준다 — 그래서 apiList 가
    // 아니라 apiGet 이다.
    queryFn: () => apiGet<SRAttachmentView[]>(`/api/srs/${srId}/attachments`),
    // 예전 effect 는 마운트마다 무조건 다시 읽었다. 전역 기본값(60초)을 그대로 두면 다른 화면을
    // 다녀온 뒤 캐시된 옛 목록을 보게 된다.
    staleTime: 0,
    retry: retryUnlessClientError,
  });

  /**
   * 예전 `loading` state 는 첫 조회뿐 아니라 새로고침 버튼이 부른 재조회에서도 켜져,
   * 카드 전체가 "로딩 중..." 으로 대체됐다. 그 규칙("조회 중이면 로딩 카드")을 그대로
   * 옮긴 것이 `isFetching` 이다 — `isPending` 이면 새로고침이 아무 표시도 내지 않는다.
   *
   * 달라지는 점 하나: 업로드·삭제 뒤 무효화로 도는 재조회에서도 이 카드가 잠깐 뜬다.
   * 예전에는 그 두 경로가 재조회 없이 로컬 배열만 손봤기 때문에 뜨지 않았다.
   * 수동 낙관 갱신을 무효화로 바꾼 대가이고, 로딩 표시의 규칙 자체는 바뀌지 않았다.
   */
  const loading = isFetching;

  // v5 의 useQuery 에는 onError 가 없어 effect 로 옮긴다. `error` 는 실패마다 새 객체이므로
  // 실패 1회당 정확히 한 번 뜬다 — 예전 catch 와 같은 횟수다.
  useEffect(() => {
    if (!error) return;
    toast({
      title: '오류',
      description: LOAD_ERROR_MESSAGE,
      variant: 'destructive',
    });
  }, [error, toast]);

  const uploadMutation = useMutation({
    mutationFn: ({ file }: UploadVariables) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('srId', srId);

      // ⚠️ Content-Type 을 직접 붙이지 않는다. multipart 는 브라우저가 boundary 를 계산해
      //    붙여야 하고, 우리가 헤더를 넣는 순간 서버가 본문을 파싱하지 못한다.
      //    `apiPost` 는 body 가 FormData 면 헤더를 생략한다(api-client.ts 상단 ⚠️ 참조).
      return apiPost<SRAttachmentView>('/api/attachments', formData, {
        fallbackMessage: '파일 업로드 실패',
      });
    },
    onSuccess: (_attachment, { input }) => {
      // 예전에는 `setAttachments([new, ...prev])` 로 손수 낙관 갱신했다. 무효화로 바꾼다 —
      // 서버가 POST 응답으로 주는 표현과 목록 조회가 주는 표현이 어긋나도 화면이 어긋나지
      // 않는다. 정렬(createdAt desc)도 서버가 다시 정해 준다.
      void queryClient.invalidateQueries({ queryKey: qk.sr.attachments(srId) });

      toast({
        title: '성공',
        description: '파일이 업로드되었습니다.',
      });

      // 입력 필드 초기화 — 실패했을 때는 비우지 않는다(같은 파일 재시도 가능).
      input.value = '';
    },
    onError: (uploadError) => {
      toast({
        title: '오류',
        // 서버가 준 메시지를 그대로 보여 준다(용량·확장자 거부 사유가 여기 실린다).
        description:
          uploadError instanceof Error ? uploadError.message : '파일 업로드에 실패했습니다.',
        variant: 'destructive',
      });
    },
  });

  const uploading = uploadMutation.isPending;

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file) return;

    // 파일 크기 검증 (10MB) — 요청을 보내기 전에 끝난다.
    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: '오류',
        description: '파일 크기는 10MB를 초과할 수 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    uploadMutation.mutate({ file, input: event.target });
  };

  const [fileToDelete, setFileToDelete] = useState<string | null>(null);

  const handleDeleteClick = (attachmentId: string) => {
    setFileToDelete(attachmentId);
  };

  const deleteMutation = useMutation({
    mutationFn: (attachmentId: string) => apiDelete<void>(`/api/attachments/${attachmentId}`),
    onSuccess: () => {
      // 예전에는 `attachments.filter(...)` 로 손수 지웠다. 무효화가 같은 결과를 만든다.
      void queryClient.invalidateQueries({ queryKey: qk.sr.attachments(srId) });

      toast({
        title: '성공',
        description: '파일이 삭제되었습니다.',
      });
    },
    onError: () => {
      // 조회와 마찬가지로 서버 메시지를 쓰지 않는다 — 항상 같은 문장이 이 화면의 계약이다.
      toast({
        title: '오류',
        description: '파일 삭제에 실패했습니다.',
        variant: 'destructive',
      });
    },
  });

  const executeDelete = () => {
    if (!fileToDelete) return;

    const attachmentId = fileToDelete;
    // 요청보다 먼저 다이얼로그를 닫는다(예전 순서 그대로).
    setFileToDelete(null);

    deleteMutation.mutate(attachmentId);
  };

  const formatFileSize = (bytes: number | bigint) => {
    const numBytes = Number(bytes);
    if (numBytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(numBytes) / Math.log(k));
    return Math.round((numBytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
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
                onClick={() => void refetch()}
                disabled={loading || uploading}
                title="새로고침"
                aria-label="새로고침"
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
                    aria-label={`${attachment.fileName} 미리보기`}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      // 내부 API 가 아니라 스토리지의 파일 URL 을 blob 으로 받는다.
                      // 캐시할 데이터가 아니므로 React Query 대상이 아니고, api-client 도
                      // 지나지 않는다(응답이 JSON 이 아니다).
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
                    aria-label={`${attachment.fileName} 다운로드`}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteClick(attachment.id)}
                      title="삭제"
                      aria-label={`${attachment.fileName} 삭제`}
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
