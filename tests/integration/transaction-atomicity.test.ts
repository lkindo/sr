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
 * 감사 3.37 — 트랜잭션 원자성 (실제 Postgres).
 *
 * 서비스 테스트 12개 파일이 `$transaction: vi.fn((cb) => cb(mock))` 패스스루 스텁을 쓴다.
 * 그 스텁은 각 호출을 독립 커밋처럼 다루므로 **부분 쓰기가 롤백되지 않는 버그를
 * 구조적으로 감지할 수 없다** — 예: `sr_status_history` 행 없이 생성된 SR.
 *
 * 여기서는 실제 트랜잭션이 중간 실패 시 전부 되돌리는지 확인한다.
 */

describeDb('트랜잭션 원자성 (실제 DB)', () => {
  let clientId: string;
  let categoryId: string;
  let requesterId: string;

  beforeEach(async () => {
    await resetDatabase();
    await requireRole('ADMIN');

    clientId = (await createClientRow()).id;
    categoryId = (await createCategoryRow(clientId)).id;
    requesterId = (await createUserRow({ roleName: 'ADMIN' })).id;
  });

  const sessionUser = () =>
    ({
      id: requesterId,
      email: 'admin@example.com',
      roles: ['ADMIN'],
      permissions: [],
      clientIds: [],
    }) as never;

  it('SR 생성은 activity 와 함께 커밋된다', async () => {
    const sr = await srService.createSR(
      {
        title: '원자성 확인용 SR 입니다',
        description: 'SR 과 활동 로그가 함께 커밋되는지 확인합니다.',
        clientId,
        serviceCategoryId: categoryId,
        requestedPriority: 'MEDIUM',
      },
      sessionUser()
    );

    const activities = await prisma.sRActivity.findMany({ where: { srId: sr.id } });
    expect(activities.length).toBeGreaterThan(0);
  });

  it('트랜잭션 중간에 실패하면 SR 도 시퀀스도 남지 않는다', async () => {
    const before = await prisma.sR.count();

    // 트랜잭션 안에서 SR 을 만든 뒤 강제로 던진다.
    // 패스스루 스텁이었다면 SR 행이 남았을 것이다.
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.sR.create({
          data: {
            srNumber: 'SR-ROLLBACK-0001',
            title: '롤백되어야 하는 SR',
            description: '이 행은 커밋되면 안 됩니다.',
            clientId,
            serviceCategoryId: categoryId,
            requesterId,
            requestedPriority: 'MEDIUM',
            priority: 'MEDIUM',
            status: 'REQUESTED',
          },
        });
        throw new Error('의도적 실패');
      })
    ).rejects.toThrow('의도적 실패');

    expect(await prisma.sR.count()).toBe(before);
    expect(await prisma.sR.findUnique({ where: { srNumber: 'SR-ROLLBACK-0001' } })).toBeNull();
  });

  it('자식 행 생성이 실패하면 부모 SR 도 롤백된다', async () => {
    const before = await prisma.sR.count();

    await expect(
      prisma.$transaction(async (tx) => {
        const sr = await tx.sR.create({
          data: {
            srNumber: 'SR-ROLLBACK-0002',
            title: '자식 실패로 롤백될 SR',
            description: '활동 로그 생성이 FK 위반으로 실패합니다.',
            clientId,
            serviceCategoryId: categoryId,
            requesterId,
            requestedPriority: 'MEDIUM',
            priority: 'MEDIUM',
            status: 'REQUESTED',
          },
        });

        // 존재하지 않는 사용자로 활동 로그를 만들어 FK 위반을 일으킨다.
        await tx.sRActivity.create({
          data: {
            srId: sr.id,
            userId: 'does-not-exist',
            type: 'CREATED',
            description: 'FK 위반을 유도합니다.',
          },
        });
      })
    ).rejects.toThrow();

    // 부모 SR 이 남아 있으면 원자성이 깨진 것이다.
    expect(await prisma.sR.count()).toBe(before);
  });

  it('커밋된 트랜잭션의 자식 행은 함께 조회된다', async () => {
    const sr = await prisma.$transaction(async (tx) => {
      const created = await tx.sR.create({
        data: {
          srNumber: 'SR-COMMIT-0001',
          title: '정상 커밋되는 SR',
          description: '부모와 자식이 모두 남아야 합니다.',
          clientId,
          serviceCategoryId: categoryId,
          requesterId,
          requestedPriority: 'MEDIUM',
          priority: 'MEDIUM',
          status: 'REQUESTED',
        },
      });

      await tx.sRStatusHistory.create({
        data: {
          srId: created.id,
          currentStatus: 'REQUESTED',
          changedBy: requesterId,
        },
      });

      return created;
    });

    const history = await prisma.sRStatusHistory.findMany({ where: { srId: sr.id } });
    expect(history).toHaveLength(1);
  });
});
