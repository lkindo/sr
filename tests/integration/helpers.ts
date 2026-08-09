import { PrismaClient } from '@prisma/client';
import { describe } from 'vitest';

import prisma from '@/lib/prisma';

import { assertDestructiveResetIsSafe } from './db-guard';

const SKIPPING_DB_TESTS = process.env.SKIP_DB_TESTS === 'true';

/**
 * DB 통합 테스트용 describe.
 *
 * 기본값은 **실행**이다. 건너뛰려면 `SKIP_DB_TESTS=true` 를 명시해야 한다.
 * "DB 가 있으면 실행" 같은 반대 방향으로 만들면 CI 설정이 어긋났을 때 아무것도 돌지 않으면서
 * 초록불이 되는데, 그게 이 감사 항목(3.37)이 지적한 실패 방식 그 자체다.
 */
export const describeDb = SKIPPING_DB_TESTS ? describe.skip : describe;

/**
 * DB 통합 테스트 공용 헬퍼 (감사 3.37).
 *
 * **왜 트랜잭션 롤백이 아니라 TRUNCATE 인가**
 * 감사는 "각 테스트를 롤백되는 실제 `$transaction` 으로 감싸기"를 제안했지만, 서비스 계층이
 * 전역 `prisma` 싱글턴(`@/lib/prisma`)을 직접 import 하므로 트랜잭션 클라이언트를 주입할
 * 경로가 없다. 억지로 주입하려면 프로덕션 코드를 테스트를 위해 뒤집어야 한다.
 * 대신 매 테스트 전에 데이터 테이블을 비우고 필요한 것만 새로 만든다 — 격리는 동일하게
 * 보장되고 프로덕션 코드는 그대로 둔다.
 */

/** 데이터 테이블. 참조 데이터(권한/역할/역할-권한)는 시드 결과를 재사용하므로 제외한다. */
const DATA_TABLES = [
  'audit_logs',
  'notifications',
  'notification_preferences',
  'push_subscriptions',
  'sr_status_history',
  'sr_attachments',
  'sr_comments',
  'sr_activities',
  'srs',
  'sr_sequences',
  'client_handlers',
  'service_categories',
  'user_clients',
  'user_roles',
  'clients',
  'users',
] as const;

/**
 * 데이터 테이블을 비운다. 참조 데이터는 남긴다.
 *
 * CASCADE 를 쓰므로 FK 순서를 신경 쓰지 않아도 되지만, 목록 자체는 명시해
 * 실수로 permissions/roles 까지 날리지 않도록 한다(그러면 이후 테스트가 전부 깨진다).
 */
export async function resetDatabase(client: PrismaClient = prisma) {
  // TRUNCATE 를 실제로 실행하는 것은 이 함수뿐이다. 셋업(vitest.integration.setup.ts)이
  // 이미 앞에서 막지만, 마지막 관문은 방아쇠를 쥔 쪽이 들고 있어야 한다.
  assertDestructiveResetIsSafe();

  const list = DATA_TABLES.map((t) => `"${t}"`).join(', ');
  await client.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

/** 참조 데이터(역할)가 시드되어 있는지 확인한다. 없으면 명확히 실패시킨다. */
export async function requireRole(name: string, client: PrismaClient = prisma) {
  const role = await client.role.findUnique({ where: { name } });
  if (!role) {
    throw new Error(
      `역할 '${name}' 이 없습니다. 통합 테스트 전에 \`pnpm db:seed\` 가 실행되어야 합니다.`
    );
  }
  return role;
}

let seq = 0;
/** 테스트 간 충돌하지 않는 고유 접미사. */
export function uniqueSuffix() {
  seq += 1;
  return `${process.pid}-${seq}`;
}

export async function createClientRow(
  overrides: Partial<{ code: string; name: string; isActive: boolean }> = {},
  client: PrismaClient = prisma
) {
  const suffix = uniqueSuffix();
  return client.client.create({
    data: {
      code: overrides.code ?? `C${suffix}`.slice(0, 20),
      name: overrides.name ?? `고객사 ${suffix}`,
      isActive: overrides.isActive ?? true,
    },
  });
}

export async function createUserRow(
  overrides: Partial<{ email: string; name: string; isActive: boolean; roleName: string }> = {},
  client: PrismaClient = prisma
) {
  const suffix = uniqueSuffix();
  const user = await client.user.create({
    data: {
      email: overrides.email ?? `user-${suffix}@example.com`,
      name: overrides.name ?? `사용자 ${suffix}`,
      password: 'not-a-real-hash',
      isActive: overrides.isActive ?? true,
    },
  });

  if (overrides.roleName) {
    const role = await requireRole(overrides.roleName, client);
    await client.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }

  return user;
}

export async function createCategoryRow(
  clientId: string | null,
  overrides: Partial<{ categoryName: string; slaHours: number }> = {},
  client: PrismaClient = prisma
) {
  const suffix = uniqueSuffix();
  return client.serviceCategory.create({
    data: {
      clientId,
      categoryName: overrides.categoryName ?? `카테고리 ${suffix}`,
      slaHours: overrides.slaHours ?? 24,
      priority: 'MEDIUM',
      isActive: true,
    },
  });
}
