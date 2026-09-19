import { beforeEach, expect, it } from 'vitest';

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
 * SR 이력 FK(2026-09-18 소유자 결정 D12, 마이그레이션 20260919090000_sr_history_fk_restrict).
 *
 * 활동·상태 이력은 SR 물리 삭제와 함께 조용히 사라지지 않는다 — 이력이 있으면 DB 가 SR 삭제를 거부한다. 앱은
 * SR 을 논리 삭제만 하므로 이 규칙은 수작업 DB 삭제와 앞으로 만들 정리 배치를 위한 안전장치다.
 */
describeDb('SR 이력 FK — RESTRICT', () => {
  let srId: string;

  beforeEach(async () => {
    await resetDatabase();
    await requireRole('ADMIN');
    const clientId = (await createClientRow()).id;
    const categoryId = (await createCategoryRow(clientId)).id;
    const adminId = (await createUserRow({ roleName: 'ADMIN' })).id;
    const created = await srService.createSR(
      {
        title: '이력 보호 확인용 SR 입니다',
        description: '활동 이력이 남은 SR 을 물리 삭제해 본다.',
        clientId,
        serviceCategoryId: categoryId,
        requestedPriority: 'MEDIUM',
      },
      {
        id: adminId,
        email: 'a@example.com',
        roles: ['ADMIN'],
        permissions: [],
        clientIds: [],
      } as never
    );
    srId = created.id;
  });

  it('활동 이력이 있는 SR 은 물리 삭제되지 않는다', async () => {
    expect(await prisma.sRActivity.count({ where: { srId } })).toBeGreaterThan(0);

    await expect(prisma.sR.delete({ where: { id: srId } })).rejects.toThrow();
    expect(await prisma.sR.count({ where: { id: srId } })).toBe(1);
  });

  it('이력을 명시적으로 먼저 지우면 삭제된다 — 차단이 이력 때문임을 보이는 대조군', async () => {
    await prisma.sRActivity.deleteMany({ where: { srId } });
    await prisma.sRStatusHistory.deleteMany({ where: { srId } });

    await prisma.sR.delete({ where: { id: srId } });

    expect(await prisma.sR.count({ where: { id: srId } })).toBe(0);
  });
});
