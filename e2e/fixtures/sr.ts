import { APIRequestContext, Browser, expect } from '@playwright/test';

import { PERSONA_AUTH_FILES, type PersonaKey } from '../helpers/auth-helpers';

/**
 * SR 픽스처 — 검증 대상이 아닌 준비 단계는 API 로 끝낸다.
 *
 * ── 왜 필요한가 ──────────────────────────────────────────────────────────
 * SR 등록 다이얼로그를 UI 로 통과하는 코드가 스위트에 12벌, 접수 폼이 7벌 있었다.
 * 한 벌이 도는 데 20~40초가 든다(목록 이동 → 다이얼로그 → 4필드 → 콤보박스 2개 →
 * 저장 → 목록 재조회 → 행 탐색, 실패하면 최대 5회 새로고침). 그런데 그중 대부분은
 * **검증 대상이 아니라 arrange 단계**다. 17·18·19·21·22 가 확인하려는 것은 협업·
 * 재배정·첨부·상태 전이·접수 정보이지 "등록 다이얼로그가 동작하는가" 가 아니다.
 *
 * 등록 UI 는 04-sr-create.spec.ts 가, 접수 폼 UI 는 22-sr-intake-process.spec.ts 가
 * 각각 한 번씩 검증한다. 나머지는 전부 이 파일을 쓴다.
 *
 * ── 설계 원칙 ────────────────────────────────────────────────────────────
 * 1. 준비가 실패하면 **즉시, 크게** 실패한다. 픽스처가 조용히 부분 성공하면
 *    본 검증이 엉뚱한 상태를 보고 실패하고, 원인을 스펙에서 찾게 된다.
 *    모든 단계가 상태 코드와 응답 본문을 단언한다.
 * 2. 페르소나는 **의미로** 고른다. 요청자는 CLIENT_USER 여야 confirm/reopen 을
 *    검증할 수 있고(신청자만 가능), 담당자는 ENGINEER 여야 그 세션이 SR 을 열 수 있다.
 * 3. 반환값에 srNumber 와 clientId 를 함께 담는다 — 목록에서 행을 찾을 때
 *    제목보다 SR 번호가 안전하다(제목은 검색 디바운스·부분 일치의 영향을 받는다).
 */

/** 이 픽스처가 도달시킬 수 있는 SR 상태. */
export type SRStage =
  'REQUESTED' | 'INTAKE' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CONFIRMED' | 'REJECTED';

export type SRPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface SeededSR {
  id: string;
  srNumber: string;
  title: string;
  clientId: string;
  /** 요청자 계정의 이메일 (confirm/reopen 을 누가 할 수 있는지 판단할 때 쓴다) */
  requesterEmail: string;
  /** 담당자 이메일. 접수 이전 단계라면 undefined. */
  assigneeEmail?: string;
  stage: SRStage;
}

export interface SeedSROptions {
  /** 어느 단계까지 진행할지. 기본 'REQUESTED' (생성만). */
  stage?: SRStage;
  /** 제목. 기본값은 호출 시각이 섞인 고유 문자열. 5자 이상이어야 한다. */
  title?: string;
  /** 설명. 10자 이상이어야 한다(srCreateSchema). */
  description?: string;
  requestedPriority?: SRPriority;
  /** 접수 시 지정할 실제 우선순위. 기본 'MEDIUM'. */
  actualPriority?: SRPriority;
  estimatedHours?: number;
  intakeNotes?: string;
  /** 담당자 이메일. 기본은 ENGINEER 페르소나. */
  assigneeEmail?: string;
  /** 완료 처리 시 해결 내용. complete 액션에 필수다. */
  resolutionDescription?: string;
  /** 보류/거절 사유. hold·reject 액션에 필수다. */
  reason?: string;
}

/** 담당자 기본값. helpers/test-helpers.ts 의 ENGINEER_ASSIGNEE_EMAIL 과 반드시 같아야 한다. */
export const ENGINEER_EMAIL = process.env.TEST_ENGINEER_EMAIL || 'engineeruser@example.com';
const CLIENT_EMAIL = process.env.TEST_CLIENT_EMAIL || 'clientuser@example.com';

/** 상태 전이 순서. stage 옵션이 요구하는 만큼만 앞에서부터 실행한다. */
const LINEAR_STAGES: SRStage[] = ['REQUESTED', 'INTAKE', 'IN_PROGRESS', 'COMPLETED', 'CONFIRMED'];

interface PersonaApi {
  request: APIRequestContext;
  close: () => Promise<void>;
}

/** 페르소나 세션으로 API 요청 컨텍스트를 연다. baseURL 은 프로젝트 설정에서 상속된다. */
async function openPersona(browser: Browser, persona: PersonaKey): Promise<PersonaApi> {
  const context = await browser.newContext({ storageState: PERSONA_AUTH_FILES[persona] });
  return { request: context.request, close: () => context.close() };
}

async function expectOk(
  response: import('@playwright/test').APIResponse,
  expected: number,
  what: string
): Promise<unknown> {
  if (response.status() !== expected) {
    const body = await response.text().catch(() => '(본문 없음)');
    // 픽스처 실패는 스펙의 결함이 아니라 준비의 결함이다. 어느 쪽인지 즉시 알 수 있게
    // 요청 대상과 응답 본문을 그대로 메시지에 싣는다.
    expect(
      response.status(),
      `[SR 픽스처] ${what} 실패 — 기대 ${expected}, 실제 ${response.status()}. 응답: ${body.slice(0, 400)}`
    ).toBe(expected);
  }
  return response.json().catch(() => ({}));
}

/** 담당자 후보의 사용자 ID 를 이메일로 찾는다. */
async function resolveUserId(admin: APIRequestContext, email: string): Promise<string> {
  const response = await admin.get(`/api/users?search=${encodeURIComponent(email)}&pageSize=50`);
  const body = (await expectOk(response, 200, `사용자 조회(${email})`)) as {
    data?: Array<{ id: string; email: string }>;
  };
  const user = (body.data ?? []).find((candidate) => candidate.email === email);
  expect(
    user,
    `[SR 픽스처] ${email} 계정을 찾지 못했습니다. prisma/seed.ts 를 먼저 실행하세요.`
  ).toBeTruthy();
  return user!.id;
}

/**
 * SR 을 만들고 원하는 상태까지 API 로 밀어 올린다.
 *
 * 요청자는 CLIENT_USER 고정이다. 그래야 (1) 고객사가 세션에서 자동 결정되고,
 * (2) COMPLETED → CONFIRMED 를 신청자 권한으로 진행할 수 있다.
 */
export async function seedSR(browser: Browser, options: SeedSROptions = {}): Promise<SeededSR> {
  const {
    stage = 'REQUESTED',
    requestedPriority = 'MEDIUM',
    actualPriority = 'MEDIUM',
    estimatedHours = 4,
    intakeNotes = '픽스처가 API 로 접수했습니다.',
    assigneeEmail = ENGINEER_EMAIL,
    resolutionDescription = '픽스처가 API 로 완료 처리했습니다.',
    reason = '픽스처가 API 로 상태를 변경했습니다.',
  } = options;

  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const title = options.title ?? `픽스처 SR ${stamp}`;
  const description = options.description ?? `E2E 픽스처가 생성한 SR 입니다. (${stamp})`;

  const client = await openPersona(browser, 'client');
  const manager = await openPersona(browser, 'legacyManager');
  const engineer = await openPersona(browser, 'engineer');

  try {
    // ── 1) 생성 (CLIENT_USER) ────────────────────────────────────────────
    const session = (await expectOk(
      await client.request.get('/api/auth/session'),
      200,
      'CLIENT 세션 조회'
    )) as { user?: { clientIds?: string[] } };
    const clientId = session.user?.clientIds?.[0];
    expect(
      clientId,
      '[SR 픽스처] CLIENT_USER 에게 소속 고객사가 없습니다. prisma/seed.ts 계약이 깨졌습니다.'
    ).toBeTruthy();

    const categories = (await expectOk(
      await client.request.get(`/api/clients/${clientId}/categories`),
      200,
      '서비스 카테고리 조회'
    )) as Array<{ id: string }>;
    expect(
      categories.length,
      '[SR 픽스처] 고객사에 서비스 카테고리가 없어 SR 을 만들 수 없습니다.'
    ).toBeGreaterThan(0);

    const created = (await expectOk(
      await client.request.post('/api/srs', {
        data: {
          title,
          description,
          clientId,
          serviceCategoryId: categories[0]!.id,
          requestedPriority,
        },
      }),
      201,
      'SR 생성'
    )) as { id: string; srNumber: string };

    const seeded: SeededSR = {
      id: created.id,
      srNumber: created.srNumber,
      title,
      clientId: clientId!,
      requesterEmail: CLIENT_EMAIL,
      stage: 'REQUESTED',
    };

    if (stage === 'REQUESTED') return seeded;

    // ── 거절은 선형 경로 밖이다. 접수 없이 REQUESTED 에서 바로 간다. ────
    if (stage === 'REJECTED') {
      await expectOk(
        await manager.request.patch(`/api/srs/${seeded.id}/status`, {
          data: { action: 'reject', reason },
        }),
        200,
        'reject 전이'
      );
      return { ...seeded, stage: 'REJECTED' };
    }

    // ── 2) 접수 (MANAGER 세션) ───────────────────────────────────────────
    const assigneeId = await resolveUserId(manager.request, assigneeEmail);
    await expectOk(
      await manager.request.post(`/api/srs/${seeded.id}/intake`, {
        data: {
          actualPriority,
          estimatedHours,
          // 스키마상 필수다. 서버는 SLA 로 dueDate 를 따로 계산하므로 이 값은
          // "요청된 완료 희망일" 의 자리 표시자로만 쓰인다.
          estimatedCompletionDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
          intakeNotes,
          assigneeId,
        },
      }),
      200,
      '접수(intake)'
    );
    seeded.assigneeEmail = assigneeEmail;
    seeded.stage = 'INTAKE';
    if (stage === 'INTAKE') return seeded;

    // ── 3) 이후 전이는 담당 엔지니어 세션으로 ────────────────────────────
    const transition = async (
      action: 'start' | 'complete' | 'hold' | 'resume',
      api: APIRequestContext,
      data: Record<string, unknown> = {}
    ) => {
      await expectOk(
        await api.patch(`/api/srs/${seeded.id}/status`, { data: { action, ...data } }),
        200,
        `${action} 전이`
      );
    };

    await transition('start', engineer.request);
    seeded.stage = 'IN_PROGRESS';

    if (stage === 'ON_HOLD') {
      await transition('hold', engineer.request, { reason });
      seeded.stage = 'ON_HOLD';
      return seeded;
    }
    if (stage === 'IN_PROGRESS') return seeded;

    await transition('complete', engineer.request, { resolutionDescription });
    seeded.stage = 'COMPLETED';
    if (stage === 'COMPLETED') return seeded;

    // ── 4) 확인 완료는 신청자(CLIENT_USER)만 가능하다 ────────────────────
    await expectOk(
      await client.request.patch(`/api/srs/${seeded.id}/status`, { data: { action: 'confirm' } }),
      200,
      'confirm 전이'
    );
    seeded.stage = 'CONFIRMED';
    return seeded;
  } finally {
    await Promise.all([client.close(), manager.close(), engineer.close()]);
  }
}

/**
 * 픽스처가 만든 SR 을 지운다.
 *
 * 공유 DB 를 쓰므로 정리는 선택이 아니다. 실패해도 테스트를 무너뜨리지는 않되
 * (afterAll 에서 부르는 경우가 많다) 조용히 넘기지는 않는다 — 남은 SR 이 쌓이면
 * 다음 실행의 목록·카운트 단언이 흔들린다.
 */
export async function deleteSeededSRs(browser: Browser, ids: Array<string | undefined>) {
  const targets = ids.filter((id): id is string => Boolean(id));
  if (targets.length === 0) return;

  const admin = await openPersona(browser, 'admin');
  try {
    for (const id of targets) {
      const response = await admin.request.delete(`/api/srs/${id}`);
      if (!response.ok()) {
        console.warn(`[SR 픽스처] 정리 실패: DELETE /api/srs/${id} → ${response.status()}`);
      }
    }
  } finally {
    await admin.close();
  }
}

/** stage 가 선형 경로상 target 이상인지 (테스트에서 전제 확인용). */
export function isAtLeastStage(stage: SRStage, target: SRStage): boolean {
  const a = LINEAR_STAGES.indexOf(stage);
  const b = LINEAR_STAGES.indexOf(target);
  return a >= 0 && b >= 0 && a >= b;
}
