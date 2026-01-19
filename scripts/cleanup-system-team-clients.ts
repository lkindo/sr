/**
 * 시스템 운영팀(ADMIN, MANAGER, ENGINEER)에게 잘못 할당된 고객사 관계를 정리하는 스크립트
 *
 * 실행 방법:
 * npx tsx scripts/cleanup-system-team-clients.ts
 *
 * 또는 dry-run 모드 (실제 삭제하지 않고 확인만):
 * npx tsx scripts/cleanup-system-team-clients.ts --dry-run
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SYSTEM_ROLES = ['ADMIN', 'MANAGER', 'ENGINEER'];

async function main() {
  const isDryRun = process.argv.includes('--dry-run');

  console.log('='.repeat(60));
  console.log('시스템 운영팀 고객사 할당 정리 스크립트');
  console.log('='.repeat(60));
  console.log(`모드: ${isDryRun ? 'DRY-RUN (실제 삭제 안함)' : 'PRODUCTION (실제 삭제)'}`);
  console.log();

  // 1. 시스템 운영팀 역할을 가진 사용자 조회
  console.log('1️⃣  시스템 운영팀 사용자 조회 중...');
  const systemTeamUsers = await prisma.user.findMany({
    where: {
      roles: {
        some: {
          role: {
            name: {
              in: SYSTEM_ROLES,
            },
          },
        },
      },
    },
    include: {
      roles: {
        include: {
          role: true,
        },
      },
      clients: {
        include: {
          client: true,
        },
      },
    },
  });

  console.log(`   ✓ 총 ${systemTeamUsers.length}명의 시스템 운영팀 사용자 발견`);
  console.log();

  // 2. 고객사가 할당된 시스템 운영팀 사용자 필터링
  const usersWithClients = systemTeamUsers.filter((user) => user.clients.length > 0);

  if (usersWithClients.length === 0) {
    console.log(
      '✅ 정리가 필요한 데이터가 없습니다. 모든 시스템 운영팀 사용자는 고객사가 할당되지 않았습니다.'
    );
    console.log();
    return;
  }

  console.log(`2️⃣  고객사가 할당된 시스템 운영팀 사용자: ${usersWithClients.length}명`);
  console.log();

  // 3. 상세 정보 출력
  let totalUserClientRelations = 0;

  for (const user of usersWithClients) {
    const userRoles = user.roles.map((ur) => ur.role.name).join(', ');
    const clientNames = user.clients.map((uc) => uc.client.name).join(', ');
    totalUserClientRelations += user.clients.length;

    console.log(`   📋 사용자: ${user.name} (${user.email})`);
    console.log(`      - 역할: ${userRoles}`);
    console.log(`      - 할당된 고객사 (${user.clients.length}개): ${clientNames}`);
    console.log();
  }

  console.log(`3️⃣  삭제할 UserClient 관계: 총 ${totalUserClientRelations}개`);
  console.log();

  // 4. 삭제 실행 또는 시뮬레이션
  if (isDryRun) {
    console.log('⚠️  DRY-RUN 모드: 실제로 삭제하지 않습니다.');
    console.log();
    console.log('실제로 정리하려면 다음 명령을 실행하세요:');
    console.log('npx tsx scripts/cleanup-system-team-clients.ts');
  } else {
    console.log('4️⃣  UserClient 관계 삭제 중...');

    const userClientIdsToDelete = usersWithClients.flatMap((user) =>
      user.clients.map((uc) => uc.id)
    );

    const deleteResult = await prisma.userClient.deleteMany({
      where: {
        id: {
          in: userClientIdsToDelete,
        },
      },
    });

    console.log(`   ✓ ${deleteResult.count}개의 UserClient 관계가 삭제되었습니다.`);
    console.log();
    console.log('✅ 정리 완료!');
  }

  console.log('='.repeat(60));
}

main()
  .catch((error) => {
    console.error('❌ 오류 발생:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
