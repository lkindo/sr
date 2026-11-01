import { NextRequest, NextResponse } from 'next/server';

import { RouteContext, validateRequestBody } from '@/lib/api-helpers';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { canIntakeSR, ensureCanIntakeSR, ensureCanReadSR } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { SR_ALIVE } from '@/lib/prisma-selects';
import { intakeSchema, intakeUpdateSchema } from '@/lib/schemas';
import { serializeResponse } from '@/lib/serialization';
import { intakeSR, updateIntakeInfo } from '@/services/sr-intake.service';

// Force Node.js runtime
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// POST /api/srs/{id}/intake - SR 접수 처리 (Rate Limit: 엄격)
// SR.INTAKE 권한이 있는 사용자만 접수 가능
export const POST = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;

    // 권한 체크: 접수(Intake)는 담당 엔지니어 배정·SLA 산정 등 운영 관리자의 트리아지 행위다
    // (policies.canIntakeSR — ADMIN·MANAGER 또는 SR:INTAKE, 소유자 결정 2026-09-18).
    ensureCanIntakeSR(session.user);

    // 1. 요청 바디 검증
    const validated = await validateRequestBody(request, intakeSchema);

    const updatedSR = await intakeSR(id, validated, session.user);

    return NextResponse.json(
      {
        success: true,
        sr: updatedSR,
        message: 'SR이 성공적으로 접수되었습니다',
      },
      { status: 200 }
    );
  },
  { preset: 'strict' }
); // 1분당 5회 (민감한 작업)

// GET /api/srs/{id}/intake - 접수 정보 조회 (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;

    const sr = await prisma.sR.findUnique({
      where: { id, ...SR_ALIVE },
      select: {
        id: true,
        clientId: true,
        requesterId: true,
        assigneeId: true,
        srNumber: true,
        title: true,
        description: true,
        status: true,
        requestedPriority: true,
        requestedCompletionDate: true,
        actualPriority: true,
        intakeNotes: true,
        estimatedHours: true,
        estimatedCompletionDate: true,
        dueDate: true,
        intakeAt: true,
        client: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        intakeBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        serviceCategory: {
          select: {
            id: true,
            categoryName: true,
            slaHours: true,
            handlerId: true,
            handler: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        attachments: {
          select: {
            id: true,
            fileName: true,
            fileSize: true,
            fileType: true,
            fileUrl: true,
            createdAt: true,
          },
        },
      },
    });

    if (!sr) {
      throw new NotFoundError('SR');
    }

    ensureCanReadSR(session.user, sr);

    // attachments.fileSize 는 Prisma BigInt 이므로 직렬화 후 응답
    // (미변환 시 JSON.stringify TypeError → 첨부가 있는 SR 의 접수 정보 조회가 500)
    return NextResponse.json(serializeResponse(sr));
  },
  { preset: 'standard' }
); // 1분당 100회

// PATCH /api/srs/{id}/intake - 접수 정보 수정 (Rate Limit: 엄격)
export const PATCH = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;

    // 1. 권한 확인: 접수 정보 수정은 접수와 같은 권한이다(policies.canIntakeSR — ADMIN·MANAGER 또는
    //    SR:INTAKE). 예전에는 여기만 역할 문자열을 직접 비교해 접수 화면·POST 와 기준이 달랐다.
    if (!canIntakeSR(session.user)) {
      throw new ForbiddenError(
        '접수 정보를 수정할 권한이 없습니다. MANAGER 또는 ADMIN 권한이 필요합니다.'
      );
    }

    // 2. 요청 바디 검증
    const validated = await validateRequestBody(request, intakeUpdateSchema);

    const { sr: updatedSR, changes } = await updateIntakeInfo(id, validated, session.user);

    return NextResponse.json(
      {
        success: true,
        sr: updatedSR,
        message: '접수 정보가 성공적으로 수정되었습니다',
        changes: changes.length > 0 ? changes : undefined,
      },
      { status: 200 }
    );
  },
  { preset: 'strict' }
); // 1분당 5회 (민감한 작업)
