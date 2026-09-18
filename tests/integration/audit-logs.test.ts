import { beforeEach, expect, it } from 'vitest';

import prisma from '@/lib/prisma';
import { auditService } from '@/services/audit.service';
import { UserService } from '@/services/user.service';

import { createUserRow, describeDb, requireRole, resetDatabase } from './helpers';

/**
 * 감사 로그 조회와 영구 삭제 가드(2026-09-18 소유자 결정 D11) — 실제 쿼리로 확인한다.
 *
 * - listLogs: 조건(행위·대상·행위자·기간)과 필터 선택지(groupBy)가 실제 Prisma 쿼리로 동작하는가.
 * - hardDeleteUser: 다른 사람·데이터에 대한 관리 이력이 있는 계정은 지우지 않는다. 본인에게 한 기록(비밀번호
 *   변경·로그인)만 있으면 지울 수 있다 — 그 기록은 대상 칸에 신원이 남는다.
 */
describeDb('감사 로그 — 조회와 영구 삭제 가드', () => {
  let actorId: string;
  let otherId: string;

  beforeEach(async () => {
    await resetDatabase();
    await requireRole('ADMIN');
    actorId = (await createUserRow({ name: '승인한 관리자', email: 'approver@example.com' })).id;
    otherId = (await createUserRow({ name: '대상 사용자' })).id;

    await prisma.auditLog.createMany({
      data: [
        {
          userId: actorId,
          actionType: 'APPROVE',
          targetEntity: 'UserClient',
          targetId: otherId,
          changes: { status: 'APPROVED' },
          createdAt: new Date('2026-09-10T03:00:00.000Z'),
        },
        {
          userId: otherId,
          actionType: 'PASSWORD_CHANGE',
          targetEntity: 'User',
          targetId: otherId,
          changes: {},
          createdAt: new Date('2026-09-15T03:00:00.000Z'),
        },
        {
          userId: null,
          actionType: 'ROLE_UPDATE',
          targetEntity: 'Role',
          targetId: 'r-1',
          changes: {},
          createdAt: new Date('2026-09-17T03:00:00.000Z'),
        },
      ],
    });
  });

  it('행위자 이름·이메일 부분 일치와 기간으로 거르고, 최근 것부터 준다', async () => {
    const byActor = await auditService.listLogs({ actor: 'APPROVER@' }, { skip: 0, take: 10 });
    expect(byActor.rows.map((row) => row.actionType)).toEqual(['APPROVE']);
    expect(byActor.rows[0]!.user?.name).toBe('승인한 관리자');

    const inRange = await auditService.listLogs(
      { from: new Date('2026-09-14T15:00:00.000Z'), to: new Date('2026-09-17T15:00:00.000Z') },
      { skip: 0, take: 10 }
    );
    expect(inRange.rows.map((row) => row.actionType)).toEqual(['ROLE_UPDATE', 'PASSWORD_CHANGE']);
    // 행위자가 없는 기록(시스템·삭제된 사용자)은 user 가 null 로 온다.
    expect(inRange.rows[0]!.user).toBeNull();
    expect(inRange.total).toBe(2);
  });

  it('필터 선택지는 실제로 쌓인 값이다', async () => {
    const { facets } = await auditService.listLogs({}, { skip: 0, take: 1 });

    expect(facets.actionTypes).toEqual(['APPROVE', 'PASSWORD_CHANGE', 'ROLE_UPDATE']);
    expect(facets.targetEntities).toEqual(['Role', 'User', 'UserClient']);
  });

  it('다른 사람에 대한 관리 이력이 있는 계정은 영구 삭제하지 않는다', async () => {
    await expect(new UserService().hardDeleteUser(actorId)).rejects.toThrow('관리 이력');
    expect(await prisma.user.count({ where: { id: actorId } })).toBe(1);
  });

  it('본인에게 한 기록(비밀번호 변경)만 있으면 영구 삭제할 수 있다 — 과잉 차단 대조군', async () => {
    await new UserService().hardDeleteUser(otherId);

    expect(await prisma.user.count({ where: { id: otherId } })).toBe(0);
  });
});
