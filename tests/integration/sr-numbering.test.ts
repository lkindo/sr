import { beforeEach, expect, it } from 'vitest';

import prisma from '@/lib/prisma';
import { appZoneDateStamp } from '@/lib/timezone';
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
 * 감사 3.37 — 동시 채번 경쟁 (실제 Postgres).
 *
 * 기존 "동시성" 테스트(`sr.service.concurrency.test.ts`)는 순환적이었다. mock **안에**
 * 원자적 시퀀스 생성기를 구현해 두고(`currentSeq += 1`, 주석: "JS 는 싱글 스레드라 안전")
 * 그 mock 이 유일한 번호를 냈는지 단언했다. 즉 `$queryRaw` 가 아니라 mock 을 검증했다.
 *
 * 여기서는 진짜 `INSERT … ON CONFLICT DO UPDATE … RETURNING` 이 동시 요청에서
 * 유일한 시퀀스를 주는지, 그리고 `srs.sr_number` UNIQUE 제약이 실제로 걸려 있는지 본다.
 */

const CONCURRENCY = 12;

describeDb('SR 번호 채번 (실제 DB)', () => {
  let clientId: string;
  let categoryId: string;
  let requester: { id: string };

  beforeEach(async () => {
    await resetDatabase();
    await requireRole('ADMIN');

    const client = await createClientRow();
    clientId = client.id;
    categoryId = (await createCategoryRow(clientId)).id;
    requester = await createUserRow({ roleName: 'ADMIN' });
  });

  const sessionUser = () =>
    ({
      id: requester.id,
      email: 'admin@example.com',
      roles: ['ADMIN'],
      permissions: [],
      clientIds: [],
    }) as never;

  it('동시 생성에서도 srNumber 가 모두 유일하다', async () => {
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) =>
        srService.createSR(
          {
            title: `동시 생성 테스트 ${i}`,
            description: '동시 채번 경쟁을 확인하기 위한 SR 입니다.',
            clientId,
            serviceCategoryId: categoryId,
            requestedPriority: 'MEDIUM',
          },
          sessionUser()
        )
      )
    );

    const numbers = results.map((r) => r.srNumber);
    expect(numbers).toHaveLength(CONCURRENCY);
    // 중복이 하나라도 있으면 UNIQUE 제약에 걸려 위에서 이미 throw 했겠지만,
    // 제약이 사라지는 회귀까지 잡기 위해 값 자체로도 확인한다.
    expect(new Set(numbers).size).toBe(CONCURRENCY);
  });

  it('시퀀스가 1부터 연속으로 증가한다', async () => {
    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        srService.createSR(
          {
            title: `연속 채번 ${i}`,
            description: '시퀀스가 건너뛰지 않는지 확인합니다.',
            clientId,
            serviceCategoryId: categoryId,
            requestedPriority: 'LOW',
          },
          sessionUser()
        )
      )
    );

    const row = await prisma.sRSequence.findUnique({ where: { date: appZoneDateStamp() } });
    expect(row?.seq).toBe(5);
  });

  it('srNumber 는 KST 달력일을 쓴다', async () => {
    const sr = await srService.createSR(
      {
        title: 'KST 채번 확인용 SR',
        description: 'UTC 기준이면 09시 이전에 전날 번호가 나온다.',
        clientId,
        serviceCategoryId: categoryId,
        requestedPriority: 'MEDIUM',
      },
      sessionUser()
    );

    expect(sr.srNumber).toBe(`SR-${appZoneDateStamp()}-0001`);
  });

  it('srNumber 에 UNIQUE 제약이 실제로 걸려 있다', async () => {
    const first = await srService.createSR(
      {
        title: '유니크 제약 확인용 SR',
        description: '같은 번호를 직접 넣어 제약이 살아 있는지 봅니다.',
        clientId,
        serviceCategoryId: categoryId,
        requestedPriority: 'MEDIUM',
      },
      sessionUser()
    );

    // 서비스를 우회해 같은 번호를 직접 밀어 넣는다 — DB 가 막아야 한다.
    await expect(
      prisma.sR.create({
        data: {
          srNumber: first.srNumber,
          title: '중복 번호',
          description: '중복 번호를 가진 SR',
          clientId,
          serviceCategoryId: categoryId,
          requesterId: requester.id,
          requestedPriority: 'MEDIUM',
          priority: 'MEDIUM',
          status: 'REQUESTED',
        },
      })
    ).rejects.toThrow();
  });
});
