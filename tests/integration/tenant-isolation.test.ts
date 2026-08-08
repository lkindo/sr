import { beforeEach, describe, expect, it } from 'vitest';

import prisma from '@/lib/prisma';
import { srService } from '@/services/sr.service';

import {
  createCategoryRow,
  createClientRow,
  createUserRow,
  describeDb,
  requireRole,
  resetDatabase,
} from './helpers';

/**
 * 감사 3.37 — 테넌트 필터가 실제로 실행되는가 (실제 Postgres).
 *
 * 기존 격리 테스트는 mock 에 전달된 `where` 객체를 **구조적으로만** 단언한다
 * (`client.actions.isolation.test.ts`). 그 방식은 "where 를 이렇게 만들었다"까지만 보증하고
 * **그 where 가 실제로 무엇을 걸러내는지는 검증하지 않는다.** 필터가 의미상 틀려도
 * (예: OR 조건 하나가 전부를 열어 버려도) 목 단언은 통과한다.
 *
 * 여기서는 두 테넌트의 실제 행을 넣고 Postgres 가 무엇을 돌려주는지 본다.
 */

describeDb('테넌트 격리 (실제 DB)', () => {
  let ownClientId: string;
  let otherClientId: string;
  let ownCategoryId: string;
  let otherCategoryId: string;
  let externalUserId: string;
  let internalUserId: string;

  beforeEach(async () => {
    await resetDatabase();
    await requireRole('ADMIN');
    await requireRole('CLIENT_USER');

    ownClientId = (await createClientRow({ name: '우리 고객사' })).id;
    otherClientId = (await createClientRow({ name: '다른 고객사' })).id;
    ownCategoryId = (await createCategoryRow(ownClientId)).id;
    otherCategoryId = (await createCategoryRow(otherClientId)).id;

    externalUserId = (await createUserRow({ roleName: 'CLIENT_USER' })).id;
    internalUserId = (await createUserRow({ roleName: 'ADMIN' })).id;

    await prisma.userClient.create({
      data: { userId: externalUserId, clientId: ownClientId, status: 'APPROVED' },
    });

    // 양쪽 테넌트에 SR 을 하나씩 만든다.
    const admin = {
      id: internalUserId,
      email: 'admin@example.com',
      roles: ['ADMIN'],
      permissions: [],
      clientIds: [],
    } as never;

    await srService.createSR(
      {
        title: '우리 고객사의 요청입니다',
        description: '자기 테넌트에서 보여야 하는 SR 입니다.',
        clientId: ownClientId,
        serviceCategoryId: ownCategoryId,
        requestedPriority: 'MEDIUM',
      },
      admin
    );

    await srService.createSR(
      {
        title: '다른 고객사의 요청입니다',
        description: '외부 사용자에게 보이면 안 되는 SR 입니다.',
        clientId: otherClientId,
        serviceCategoryId: otherCategoryId,
        requestedPriority: 'MEDIUM',
      },
      admin
    );
  });

  it('테넌트 필터가 타 고객사 SR 을 실제로 걸러낸다', async () => {
    const rows = await srService.getAllSRs({
      where: { clientId: { in: [ownClientId] } },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toContain('우리 고객사');
  });

  it('필터가 없으면 두 테넌트가 모두 보인다 (필터가 실제로 일하고 있음을 보이는 대조군)', async () => {
    const rows = await srService.getAllSRs({});
    expect(rows).toHaveLength(2);
  });

  it('소속이 없는 사용자에게 빈 목록을 준다', async () => {
    const rows = await srService.getAllSRs({ where: { clientId: { in: [] } } });
    expect(rows).toHaveLength(0);
  });

  it('교차 테넌트 SR 생성을 서비스가 거부한다', async () => {
    const external = {
      id: externalUserId,
      email: 'external@example.com',
      roles: ['CLIENT_USER'],
      permissions: ['SR:CREATE'],
      clientIds: [ownClientId],
    } as never;

    await expect(
      srService.createSR(
        {
          title: '타 테넌트로 밀어 넣는 SR',
          description: '소속되지 않은 고객사에 SR 을 만들려는 시도입니다.',
          clientId: otherClientId,
          serviceCategoryId: otherCategoryId,
          requestedPriority: 'MEDIUM',
        },
        external
      )
    ).rejects.toThrow();

    // 거부는 "던졌다"가 아니라 "행이 안 생겼다"로 확인해야 의미가 있다.
    expect(await prisma.sR.count({ where: { clientId: otherClientId } })).toBe(1);
  });

  it('타 고객사의 서비스 카테고리를 쓰는 SR 생성을 거부한다', async () => {
    const external = {
      id: externalUserId,
      email: 'external@example.com',
      roles: ['CLIENT_USER'],
      permissions: ['SR:CREATE'],
      clientIds: [ownClientId],
    } as never;

    await expect(
      srService.createSR(
        {
          title: '카테고리만 남의 것인 SR',
          description: '자기 고객사에 타 고객사 카테고리를 붙이려는 시도입니다.',
          clientId: ownClientId,
          serviceCategoryId: otherCategoryId,
          requestedPriority: 'MEDIUM',
        },
        external
      )
    ).rejects.toThrow();
  });

  it('전역 카테고리(clientId=null)는 어느 고객사에서도 쓸 수 있다', async () => {
    const globalCategoryId = (await createCategoryRow(null)).id;

    const external = {
      id: externalUserId,
      email: 'external@example.com',
      roles: ['CLIENT_USER'],
      permissions: ['SR:CREATE'],
      clientIds: [ownClientId],
    } as never;

    const sr = await srService.createSR(
      {
        title: '전역 카테고리를 쓰는 SR',
        description: '전역 카테고리는 모든 고객사가 사용할 수 있어야 합니다.',
        clientId: ownClientId,
        serviceCategoryId: globalCategoryId,
        requestedPriority: 'MEDIUM',
      },
      external
    );

    expect(sr.id).toBeDefined();
  });

  /**
   * 이슈 #249 — 배지 5종을 단일 집계로 합치면서 생 SQL 로 옮긴 부분.
   *
   * `getSRBadgeCounts` 는 Prisma 의 where 가 아니라 손으로 쓴 SQL 로 테넌트를 거른다.
   * 즉 **Prisma 가 대신 지켜 주던 경계를 우리가 직접 짊어졌다.** 술어 하나가 빠지면
   * 다른 고객사의 SR 개수가 배지 숫자로 그대로 새어 나가고, 목록에는 아무것도 안 보이니
   * 눈으로는 알아채기 어렵다. 그래서 실제 Postgres 로 확인한다.
   */
  describe('배지 집계 (getSRBadgeCounts)', () => {
    // 페이지가 넘기는 것과 같은 방식으로 오늘 범위를 만든다(컨테이너 TZ = Asia/Seoul).
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const countsFor = (clientIds: string[] | null) =>
      srService.getSRBadgeCounts({
        clientIds,
        dueFrom: today,
        dueTo: tomorrow,
        assigneeId: internalUserId,
      });

    it('외부 사용자 스코프는 타 고객사를 세지 않는다', async () => {
      const counts = await countsFor([ownClientId]);

      // 양쪽 테넌트에 REQUESTED SR 이 하나씩 있다. 스코프가 동작하면 1 이다.
      expect(counts.waiting).toBe(1);
    });

    it('전 테넌트(null)는 양쪽을 모두 센다 — 스코프가 실제로 일하고 있음을 보이는 대조군', async () => {
      const counts = await countsFor(null);

      expect(counts.waiting).toBe(2);
    });

    // 소속 승인 대기 등으로 고객사가 하나도 없는 사용자. 여기서 열리는 방향으로
    // 실패하면(빈 배열을 '조건 없음'으로 해석하면) 전 테넌트가 노출된다.
    it('소속 고객사가 없으면 모든 배지가 0 이다', async () => {
      const counts = await countsFor([]);

      expect(counts).toEqual({
        waiting: 0,
        inProgress: 0,
        urgent: 0,
        dueToday: 0,
        myAssigned: 0,
      });
    });

    it('배지마다 서로 다른 술어를 적용한다', async () => {
      // 우리 테넌트의 SR 을 '오늘 마감 · 진행 중 · 긴급 · 내 담당' 으로 바꾼다.
      const noon = new Date(today);
      noon.setHours(12, 0, 0, 0);
      await prisma.sR.updateMany({
        where: { clientId: ownClientId },
        data: {
          status: 'IN_PROGRESS',
          priority: 'CRITICAL',
          dueDate: noon,
          assigneeId: internalUserId,
        },
      });

      const counts = await countsFor([ownClientId]);

      expect(counts).toEqual({
        waiting: 0, // 더 이상 REQUESTED 가 아니다
        inProgress: 1,
        urgent: 1,
        dueToday: 1,
        myAssigned: 1,
      });
    });

    // 마감일 경계는 KST 자정이다. 어제/내일 마감이 오늘 배지에 섞이면 안 된다.
    it('오늘 마감 배지는 날짜 경계를 지킨다', async () => {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      await prisma.sR.updateMany({
        where: { clientId: ownClientId },
        data: { status: 'IN_PROGRESS', dueDate: yesterday },
      });

      expect((await countsFor([ownClientId])).dueToday).toBe(0);
    });
  });
});
