import { beforeEach, expect, it } from 'vitest';

import prisma from '@/lib/prisma';
import { startOfAppZoneDay } from '@/lib/timezone';
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
 * '지연 중' 과 '오늘 마감' 배지 집계(헌법 §3, 2026-09-18 소유자 결정 D10) — 실제 SQL 로 확인한다.
 *
 * getSRBadgeCounts 는 raw SQL 이라 목으로는 조건이 맞는지 알 수 없다(예전에는 SQL 수준 테스트가 없어
 * 정의를 바꿔도 아무것도 빨개지지 않았다).
 *  - 지연: 진행 중 상태(접수·진행중·보류)이면서 마감이 지금보다 이른 SR. 보류도 넣는다.
 *  - 오늘 마감: 지금 이후 오늘 자정 전. 이미 지난 SR 을 섞지 않는다.
 */
describeDb('SR 배지 — 지연 중·오늘 마감', () => {
  const HOUR = 60 * 60 * 1000;
  let clientId: string;
  let adminId: string;

  async function srWith(status: string, dueDate: Date, extra: Record<string, unknown> = {}) {
    const categoryId = (await createCategoryRow(clientId)).id;
    const admin = {
      id: adminId,
      email: 'admin@example.com',
      roles: ['ADMIN'],
      permissions: [],
      clientIds: [],
    } as never;
    const created = await srService.createSR(
      {
        title: `상태 ${status} 인 SR 입니다`,
        description: '배지 집계 확인용 SR 입니다.',
        clientId,
        serviceCategoryId: categoryId,
        requestedPriority: 'MEDIUM',
      },
      admin
    );
    await prisma.sR.update({
      where: { id: created.id },
      data: { status: status as never, dueDate, ...extra },
    });
  }

  beforeEach(async () => {
    await resetDatabase();
    await requireRole('ADMIN');
    clientId = (await createClientRow()).id;
    adminId = (await createUserRow({ roleName: 'ADMIN' })).id;
  });

  it('지연은 진행 중이면서 마감을 넘긴 SR, 오늘 마감은 지금 이후 오늘 안의 SR 만 센다', async () => {
    const now = new Date();
    const tomorrow = new Date(startOfAppZoneDay(now).getTime() + 24 * HOUR);
    const laterToday = new Date(now.getTime() + (tomorrow.getTime() - now.getTime()) / 2);

    await srWith('IN_PROGRESS', new Date(now.getTime() - 2 * HOUR)); // 지연
    await srWith('ON_HOLD', new Date(now.getTime() - 72 * HOUR)); // 지연(보류도 센다)
    await srWith('INTAKE', laterToday); // 오늘 마감
    await srWith('COMPLETED', new Date(now.getTime() - 120 * HOUR)); // 끝난 SR 은 지연이 아니다
    await srWith('IN_PROGRESS', new Date(now.getTime() - HOUR), { deletedAt: now }); // 삭제된 SR 제외

    const counts = await srService.getSRBadgeCounts({
      clientIds: null,
      now,
      dueTo: tomorrow,
      assigneeId: adminId,
    });

    expect(counts.overdue).toBe(2);
    // 예전 정의(오늘 0시부터)였다면 오늘 이미 지난 IN_PROGRESS 가 섞였을 수 있다. 지금은 지금 이후만 센다.
    expect(counts.dueToday).toBe(1);
  });

  it('테넌트 스코프를 따른다 — 소속이 없으면 지연도 0 이다', async () => {
    await srWith('IN_PROGRESS', new Date(Date.now() - 2 * HOUR));

    const counts = await srService.getSRBadgeCounts({
      clientIds: [],
      now: new Date(),
      dueTo: new Date(Date.now() + 24 * HOUR),
      assigneeId: adminId,
    });

    expect(counts.overdue).toBe(0);
  });
});
