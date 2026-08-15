import { NextRequest, NextResponse } from 'next/server';

import { RouteContext } from '@/lib/api-helpers';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import {
  FileValidationError,
  formatBytes,
  MAX_UPLOAD_FILE_COUNT,
  MAX_UPLOAD_TOTAL_SIZE,
  validateFile,
} from '@/lib/file-validator';
import { ensureCanAttachToSR, ensureCanReadSR } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { SR_ACCESS_SELECT, SR_ACCESS_WITH_STATUS_SELECT, SR_ALIVE } from '@/lib/prisma-selects';
import { serializeMany, serializeResponse } from '@/lib/serialization';
import { deleteAttachmentBlob, uploadAttachmentBlob } from '@/lib/storage';
import { assertUploadSizeWithinLimit } from '@/lib/upload-guard';

// Force Node.js runtime (file system operations require Node.js)
export const runtime = 'nodejs';

/**
 * SR 첨부파일 업로드 API
 *
 * 파일 보안 검증:
 * - 파일 확장자 검증 (위험한 실행 파일 차단)
 * - Magic Number 기반 MIME 타입 검증 (스푸핑 방지)
 * - 파일 크기 검증 (타입별 제한)
 * - 허용된 파일 형식만 업로드 가능
 *
 * @param request - FormData (files: File[])
 * @param params - { id: srId }
 * @returns 201 - 업로드된 첨부파일 목록
 * @returns 400 - 검증 실패
 * @returns 404 - SR not found
 *
 * Rate Limit: 1분당 60회 (strict preset)
 */
export const POST = withAuthAndRateLimit(
  async (
    req: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id: srId } = await params;

    // 본문을 힙에 물질화하기 전에 크기를 먼저 막는다.
    // `formData()` 는 모든 파트를 인메모리 Blob 으로 파싱하므로, 그 뒤에 하는
    // 타입별 크기 검증은 메모리 보호에 아무 역할도 하지 못한다(감사 3.41).
    assertUploadSizeWithinLimit(req);

    // SR 존재 확인.
    // **status 를 포함한다** — `ensureCanAttachToSR` 이 종결된 SR(COMPLETED/CONFIRMED/
    // REJECTED)에 첨부를 붙이지 못하게 막는 판정에 그 값을 쓴다.
    const sr = await prisma.sR.findUnique({
      where: { id: srId, ...SR_ALIVE },
      select: SR_ACCESS_WITH_STATUS_SELECT,
    });

    if (!sr) {
      throw new NotFoundError('SR');
    }

    // 업로드는 쓰기다 — 읽기 권한이 아니라 수정 권한으로 게이트하고
    // 종결된 SR 은 막는다(감사 4.1).
    ensureCanAttachToSR(session.user, sr);

    // FormData에서 파일 추출
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];

    if (files.length === 0) {
      throw new BadRequestError('업로드할 파일을 선택해주세요.');
    }

    // 파일 개수 제한 (한 번에 최대 10개)
    if (files.length > MAX_UPLOAD_FILE_COUNT) {
      throw new BadRequestError(
        `한 번에 최대 ${MAX_UPLOAD_FILE_COUNT}개의 파일만 업로드할 수 있습니다.`
      );
    }

    // 총합 가드. Content-Length 가 없는 요청(chunked)이나 헤더가 실제 크기와
    // 어긋나는 경우를 대비해, 파싱 후에도 합계를 한 번 더 확인한다.
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > MAX_UPLOAD_TOTAL_SIZE) {
      throw new BadRequestError(
        `전체 업로드 용량이 너무 큽니다. 한 번에 최대 ${formatBytes(MAX_UPLOAD_TOTAL_SIZE)}까지 업로드할 수 있습니다.`
      );
    }

    /**
     * 저장은 단건 업로드와 **같은 함수**(`uploadAttachmentBlob`)를 쓴다.
     *
     * 예전에는 이 배치 경로만 자체 구현을 갖고 있었고, 파일명이
     * `${timestamp}_${index}_${safeFileName}` 이었다. 문제는 그 세 조각 중 어느 것도
     * 테넌트를 구분하지 않는다는 점이다 — 전 고객사가 `attachments/` 평면 디렉터리를
     * 공유했고, `createWriteStream` 기본 모드는 파일이 있으면 **덮어쓴다**.
     *
     * 그래서 A사와 B사 사용자가 같은 밀리초에 각각 `보고서.pdf` 를 첫 파일로 올리면
     * 경로가 정확히 같아지고, 나중 스트림이 앞 파일을 truncate 했다. 결과적으로
     * DB 에는 **서로 다른 SR 을 가리키는 두 행이 같은 storagePath** 를 갖게 되어,
     * A사 사용자가 인가를 정상 통과한 채 B사 파일 내용을 내려받았다.
     *
     * 공용 함수는 UUID 파일명 · `attachments/<srId>/` 하위 디렉터리 · `wx` 플래그 ·
     * 경로 탐색 차단을 함께 제공하므로 이 세 가지가 한 번에 닫힌다.
     */
    const results = await Promise.all(
      files.map(async (file) => {
        try {
          // 파일 검증 (확장자, 내용, 크기)
          const { mimeType, size } = await validateFile(file);

          const stored = await uploadAttachmentBlob(srId, file);

          // DB 저장 데이터 준비
          // fileUrl 은 생성 후 attachment id 기반 인증 다운로드 경로로 갱신된다(아래 참조).
          // storagePath 는 STORAGE_DIR 기준 상대 경로로 저장한다.
          const attachmentData = {
            srId,
            fileName: file.name,
            fileUrl: '',
            fileSize: size,
            fileType: mimeType, // 검증된 MIME 타입 사용
            storagePath: stored.pathname,
            uploadedBy: session.user.id,
          };

          return {
            status: 'fulfilled' as const,
            value: attachmentData,
          };
        } catch (error) {
          if (error instanceof FileValidationError) {
            return {
              status: 'rejected' as const,
              reason: error,
              fileName: file.name,
            };
          }
          throw error; // 예상하지 못한 에러는 상위로 전파 (Promise.all 중단)
        }
      })
    );

    const attachmentsToInsert = results
      .filter((r): r is { status: 'fulfilled'; value: any } => r.status === 'fulfilled')
      .map((r) => r.value);

    let createdAttachments: any[] = [];
    if (attachmentsToInsert.length > 0) {
      /**
       * 삽입 · fileUrl 갱신 · 활동 로그를 한 트랜잭션에 묶는다.
       *
       * 예전에는 `createManyAndReturn` 뒤에 N 개 update 를 `Promise.all` 로 돌리고
       * 활동 로그는 아예 없었다(감사 4.2). 중간에 실패하면 `fileUrl = ''` 인 죽은
       * 링크가 남았고, 성공해도 배치 업로드만 감사 추적에서 빠졌다 — 단일 업로드
       * 경로는 `ATTACHMENT_ADDED` 를 남기는데 배치는 남기지 않아 같은 행위가
       * 경로에 따라 다르게 기록됐다.
       */
      try {
        createdAttachments = await prisma.$transaction(async (tx) => {
          const created = await tx.sRAttachment.createManyAndReturn({
            data: attachmentsToInsert,
          });

          // fileUrl 은 attachment id 가 필요하므로 생성 후에 채운다.
          for (const a of created) {
            await tx.sRAttachment.update({
              where: { id: a.id },
              data: { fileUrl: `/api/attachments/${a.id}/download` },
            });
          }

          await tx.sRActivity.createMany({
            data: created.map((a) => ({
              srId,
              userId: session.user.id,
              type: 'ATTACHMENT_ADDED' as const,
              description: `파일 추가: ${a.fileName}`,
            })),
          });

          return created.map((a) => ({ ...a, fileUrl: `/api/attachments/${a.id}/download` }));
        });
      } catch (error) {
        // 파일은 트랜잭션 밖에서 이미 디스크에 쓰였다. 롤백되면 참조 없는 파일이
        // 남으므로 되돌린다.
        await Promise.all(
          attachmentsToInsert.map((a) =>
            deleteAttachmentBlob(a.storagePath).catch(() => {
              // 정리 실패가 원래 오류를 가리지 않도록 한다.
            })
          )
        );
        throw error;
      }
    }

    // storagePath(내부 저장 경로)는 클라이언트에 노출하지 않음
    const uploadedAttachments = createdAttachments.map(
      ({ storagePath: _storagePath, ...attachment }) => ({
        ...attachment,
        createdAt: attachment.createdAt.toISOString(),
      })
    );

    const validationErrors = results
      .filter(
        (r): r is { status: 'rejected'; reason: FileValidationError; fileName: string } =>
          r.status === 'rejected'
      )
      .map((r) => ({
        fileName: r.fileName,
        error: r.reason.message,
      }));

    // 모든 파일이 검증 실패한 경우
    if (uploadedAttachments.length === 0 && validationErrors.length > 0) {
      throw new BadRequestError(
        `모든 파일이 검증에 실패했습니다: ${validationErrors.map((e) => `${e.fileName} - ${e.error}`).join(', ')}`
      );
    }

    // Invalidate caches: detail and my-requests (첨부 카운트 등 반영)

    // fileSize 는 Prisma BigInt 이므로 직렬화 없이 응답하면 JSON.stringify 가 TypeError 를 던진다.
    return NextResponse.json(
      serializeResponse({
        success: true,
        message: `${uploadedAttachments.length}개의 파일이 업로드되었습니다.`,
        data: {
          attachments: uploadedAttachments,
          errors: validationErrors.length > 0 ? validationErrors : undefined,
        },
      }),
      { status: 201 }
    );
  },
  { preset: 'strict' }
); // 1분당 60회 (민감한 작업)

// GET /api/srs/[id]/attachments - Get all attachments for an SR (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(
  async (
    req: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id: srId } = await params;

    // 인가 판정에만 쓰므로 전체 행을 읽지 않는다(db-rules §4).
    const sr = await prisma.sR.findUnique({
      where: { id: srId, ...SR_ALIVE },
      select: SR_ACCESS_SELECT,
    });

    if (!sr) {
      throw new NotFoundError('SR');
    }

    ensureCanReadSR(session.user, sr);

    const attachments = await prisma.sRAttachment.findMany({
      where: { srId },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // storagePath(내부 저장 경로)는 클라이언트에 노출하지 않음
    const safeAttachments = attachments.map(({ storagePath: _storagePath, ...rest }) => rest);

    // fileSize(BigInt) / createdAt(Date) 직렬화
    return NextResponse.json(serializeMany(safeAttachments));
  },
  { preset: 'standard' }
); // 1분당 100회
