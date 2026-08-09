import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

import { PERMISSION_CATALOG, permissionKey } from './permission-catalog';

// 환경 변수 명시적 로드 (로컬 개발 시에만 dotenv 활용, 프로덕션은 시스템 환경변수 우선 적용)
try {
  const { config } = require('dotenv');
  config({ override: true });
} catch (e) {
  // dotenv 모듈이 없는 프로덕션 환경(Docker runner)인 경우 예외 우회
}

const prisma = new PrismaClient();

// 개발용 픽스처(테스트 계정/고객사/샘플 SR) 실행 여부.
// - 프로덕션(NODE_ENV=production)에서는 어떤 경우에도 실행하지 않는다.
// - 그 외 환경에서도 SEED_DEV_FIXTURES=true 를 명시해야만 실행된다(명시적 opt-in).
// 로컬 개발: SEED_DEV_FIXTURES=true SEED_ADMIN_PASSWORD=... pnpm db:seed
const shouldSeedDevFixtures =
  process.env.NODE_ENV !== 'production' && process.env.SEED_DEV_FIXTURES === 'true';

// bcrypt 비용. src/lib/constants.ts 의 SECURITY.BCRYPT_WORK_FACTOR 와 동일하게 유지한다.
// (시드는 앱 소스에 의존하지 않도록 값을 복제한다.)
const BCRYPT_WORK_FACTOR = 12;

// 로컬/E2E 전용 고정 해시(engineer123 / client123 / manager123 / clientadmin123).
// 위 픽스처 가드로 프로덕션에서는 절대 생성되지 않으며, 이미 존재하는 계정의
// 비밀번호를 덮어쓰는 데에는 절대 사용하지 않는다.
// 필요 시 SEED_ENGINEER_PASSWORD / SEED_CLIENT_PASSWORD /
// SEED_MANAGER_PASSWORD / SEED_CLIENT_ADMIN_PASSWORD 로 대체할 수 있다.
const ENGINEER_DEV_HASH = '$2b$10$pZqoLVt6i.EgPg.xkXhqn.hrfDnm1U2ql/dT/i73NBxuxx4pN/4s6';
const CLIENT_DEV_HASH = '$2b$10$b5TgWLUPy8AgUvjjwGdHYOg2QPsj9thL9BNSZ1GB/ZNCoPR9brocK';
const MANAGER_DEV_HASH = '$2b$12$KVxZuS/KJhY1JmZw7Cb4kORat7TQYg2Ec941O1M7bbe.r.wfT9/IC';
const CLIENT_ADMIN_DEV_HASH = '$2b$12$Xr5qU2Jjx1yL4/HD/kmAyOGDmaqfZUIldEQifY0Tj9kS9Txcx4aN.';

// 카탈로그는 prisma/permission-catalog.ts 가 원천이다.
// 앱 정책이 검사하는 문자열과의 대조는 permission-catalog.test.ts 가 강제한다.
const permissions = PERMISSION_CATALOG;

/**
 * 이번 시드 실행에서 처음 만들어진 `Permission.id` 집합.
 * `assignRolePermissions` 가 운영자 편집을 보존하면서도 신규 권한만 부착하는 데 쓴다.
 */
const permissionsCreatedThisRun = new Set<string>();

const roles = [
  {
    name: 'ADMIN',
    description: '시스템 관리자 - 모든 권한',
  },
  {
    name: 'MANAGER',
    description: '매니저 - SR 관리 및 사용자 관리',
  },
  {
    name: 'ENGINEER',
    description: '엔지니어 - SR 처리',
  },
  {
    name: 'CLIENT_ADMIN',
    description: '고객사 관리자 - 자사 SR 관리',
  },
  {
    name: 'CLIENT_USER',
    description: '고객사 사용자 - SR 생성 및 조회',
  },
];

/**
 * 역할에 기본 권한을 부여한다.
 *
 * **기본 동작은 비파괴다.** 해당 역할에 이미 권한이 배정되어 있으면 기존 배정을 건드리지
 * 않고, 이번 실행에서 카탈로그에 처음 추가된 권한만 덧붙인다.
 *
 * 이유: 이 시드는 컨테이너가 뜰 때마다 실행된다(`docker-entrypoint.sh`). 예전처럼
 * `deleteMany` + `createMany` 로 매번 초기화하면, 운영자가 `/roles` 화면
 * (`PermissionBoard`)에서 조정한 권한이 **배포·재시작마다 조용히 되돌아간다.**
 * 감사 3.2 가 지적한 "무조건 reseed 가 운영자의 변경을 무효화한다"와 같은 종류의 사고다.
 *
 * 기본값으로 되돌리고 싶으면 `SEED_FORCE_ROLE_PERMISSIONS=true` 로 명시한다
 * (로컬 개발 초기화용. 프로덕션 부팅 경로에서는 설정하지 않는다).
 */
async function assignRolePermissions(
  roleName: string,
  permissionIds: string[],
  roleId: string
): Promise<void> {
  const force = process.env.SEED_FORCE_ROLE_PERMISSIONS === 'true';
  const existingCount = await prisma.rolePermission.count({ where: { roleId } });

  if (existingCount > 0 && !force) {
    // 운영자 편집을 보존하되, **이번 실행에서 처음 생긴 권한**은 부착한다.
    //
    // 이 가드만 있던 시절에는 카탈로그에 권한을 새로 추가해도 이미 배정이 있는 역할은
    // 전부 건너뛰어, 새 권한이 어떤 역할에도 붙지 않았다 — 기존 배포에서는 추가 자체가
    // 무효였다. 반대로 목록 전체를 무조건 부착하면 운영자가 일부러 회수한 권한이
    // 배포 때마다 되살아난다.
    //
    // 방금 생성된 행은 운영자가 회수했을 수 없으므로 그 교집합만 부착하면 둘 다 지킨다.
    const freshIds = permissionIds.filter((id) => permissionsCreatedThisRun.has(id));

    if (freshIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: freshIds.map((permissionId) => ({ roleId, permissionId })),
        skipDuplicates: true,
      });
      console.log(
        `${roleName} 역할에 이번 실행에서 새로 도입된 권한 ${freshIds.length}개를 추가했습니다. ` +
          `(기존 ${existingCount}개 배정은 그대로)`
      );
      return;
    }

    console.log(
      `${roleName} 역할에 이미 권한 ${existingCount}개가 배정되어 있어 그대로 둡니다. ` +
        '(기본값으로 되돌리려면 SEED_FORCE_ROLE_PERMISSIONS=true)'
    );
    return;
  }

  if (force && existingCount > 0) {
    await prisma.rolePermission.deleteMany({ where: { roleId } });
  }

  await prisma.rolePermission.createMany({
    data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
    skipDuplicates: true,
  });
  console.log(`Assigned ${permissionIds.length} permissions to ${roleName} role`);
}

/**
 * 기준 데이터(권한/역할/역할-권한 매핑) 시딩.
 *
 * 멱등하며 사용자 데이터를 건드리지 않으므로 프로덕션 부팅 시에도 안전하게 실행할 수 있다.
 * 역할-권한은 **이미 배정된 역할을 덮어쓰지 않는다**(`assignRolePermissions` 참고).
 */
async function seedReferenceData() {
  // Create permissions
  console.log('Creating permissions...');
  permissionsCreatedThisRun.clear();
  const knownBefore = new Set(
    (await prisma.permission.findMany({ select: { resource: true, action: true } })).map(
      permissionKey
    )
  );

  for (const permission of permissions) {
    const row = await prisma.permission.upsert({
      where: {
        resource_action: {
          resource: permission.resource,
          action: permission.action,
        },
      },
      update: {},
      create: permission,
    });

    // 기존 배포에 권한을 추가할 때 역할 부착까지 이어지도록 신규 행을 기록한다.
    // (assignRolePermissions 의 비파괴 가드 참고)
    if (!knownBefore.has(permissionKey(permission))) {
      permissionsCreatedThisRun.add(row.id);
    }
  }
  console.log(
    `Created ${permissions.length} permissions ` + `(신규 ${permissionsCreatedThisRun.size}개)`
  );

  // Create roles
  console.log('Creating roles...');
  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: role,
    });
  }
  console.log(`Created ${roles.length} roles`);

  // Assign all permissions to ADMIN role
  console.log('Assigning permissions to ADMIN role...');
  const adminRole = await prisma.role.findUnique({
    where: { name: 'ADMIN' },
  });

  if (adminRole) {
    const allPermissions = await prisma.permission.findMany();

    await assignRolePermissions(
      'ADMIN',
      allPermissions.map((permission) => permission.id),
      adminRole.id
    );
  }

  // Assign permissions to MANAGER role
  console.log('Assigning permissions to MANAGER role...');
  const managerRole = await prisma.role.findUnique({
    where: { name: 'MANAGER' },
  });

  if (managerRole) {
    const managerPermissions = await prisma.permission.findMany({
      where: {
        OR: [
          // 예전엔 `{ resource: 'SR' }` 와일드카드였다. 카탈로그에 SR:CONFIRM 이 생기면서
          // 와일드카드가 그것까지 집어가는데, 확인(CONFIRMED)은 고객의 인수 행위라
          // TRANSITION_ROLES 가 MANAGER 를 의도적으로 제외한다. 와일드카드를 두면 권한
          // 경로로 그 규칙이 우회되므로 액션을 명시한다.
          {
            resource: 'SR',
            action: {
              in: [
                'CREATE',
                'READ',
                'UPDATE',
                'UPDATE_SELF',
                'DELETE',
                'ASSIGN',
                'STATUS_CHANGE',
                'INTAKE',
              ],
            },
          },
          { resource: 'CLIENT', action: { in: ['READ', 'UPDATE'] } },
          { resource: 'USER', action: { in: ['READ', 'UPDATE', 'UPDATE_SELF', 'ASSIGN_ROLE'] } },
          { resource: 'COMMENT' },
          { resource: 'ATTACHMENT' },
          { resource: 'DASHBOARD' },
          { resource: 'NOTIFICATION' },
        ],
      },
    });
    await assignRolePermissions(
      'MANAGER',
      managerPermissions.map((permission) => permission.id),
      managerRole.id
    );
  }

  // Assign permissions to ENGINEER role
  console.log('Assigning permissions to ENGINEER role...');
  const engineerRole = await prisma.role.findUnique({
    where: { name: 'ENGINEER' },
  });

  if (engineerRole) {
    const engineerPermissions = await prisma.permission.findMany({
      where: {
        OR: [
          // INTAKE 는 TRANSITION_ROLES.REQUESTED.INTAKE 가 ENGINEER 를 포함하는 것과 맞춘다.
          { resource: 'SR', action: { in: ['READ', 'UPDATE', 'STATUS_CHANGE', 'INTAKE'] } },
          { resource: 'CLIENT', action: 'READ' },
          { resource: 'USER', action: 'UPDATE_SELF' },
          { resource: 'COMMENT' },
          { resource: 'ATTACHMENT' },
          { resource: 'NOTIFICATION', action: 'READ' },
          { resource: 'DASHBOARD', action: 'READ' },
        ],
      },
    });
    await assignRolePermissions(
      'ENGINEER',
      engineerPermissions.map((permission) => permission.id),
      engineerRole.id
    );
  }

  // Assign permissions to CLIENT_ADMIN role
  console.log('Assigning permissions to CLIENT_ADMIN role...');
  const clientAdminRole = await prisma.role.findUnique({
    where: { name: 'CLIENT_ADMIN' },
  });

  if (clientAdminRole) {
    const clientAdminPermissions = await prisma.permission.findMany({
      where: {
        OR: [
          {
            resource: 'SR',
            // DELETE 는 **자사 SR 에 한정**된다 — 권한 자체가 테넌트를 넓히지 않는다.
            // policies.canDeleteSR 이 `isInternalUser(user) || user.clientIds.includes(sr.clientId)`
            // 로 외부 사용자를 자기 테넌트에 묶기 때문이다(감사 4.1 에서 강화된 조건).
            //
            // 예전에는 이 목록에 DELETE 가 없는데도 상세 화면이 CLIENT_ADMIN 에게
            // 삭제 버튼을 보여 줬다. 누르면 반드시 403 인 죽은 버튼이었다.
            // 화면 쪽이 의도를 맞게 표현하고 있었고 권한이 뒤처져 있던 쪽이다.
            action: { in: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'CONFIRM'] },
          },
          { resource: 'CLIENT', action: 'READ' },
          { resource: 'USER', action: { in: ['READ', 'UPDATE', 'UPDATE_SELF'] } },
          { resource: 'COMMENT' },
          { resource: 'ATTACHMENT' },
          { resource: 'NOTIFICATION' },
          { resource: 'DASHBOARD', action: 'READ' },
        ],
      },
    });
    await assignRolePermissions(
      'CLIENT_ADMIN',
      clientAdminPermissions.map((permission) => permission.id),
      clientAdminRole.id
    );
  }

  // Assign permissions to CLIENT_USER role
  console.log('Assigning permissions to CLIENT_USER role...');
  const clientUserRole = await prisma.role.findUnique({
    where: { name: 'CLIENT_USER' },
  });

  if (clientUserRole) {
    const clientUserPermissions = await prisma.permission.findMany({
      where: {
        OR: [
          // UPDATE_SELF 와 CONFIRM 은 예전부터 의도된 부여였지만 카탈로그에 행이 없어
          // findMany 에서 조용히 탈락했다 — 고객 사용자가 자기 SR 을 수정할 수 없던 원인.
          { resource: 'SR', action: { in: ['CREATE', 'READ', 'UPDATE_SELF', 'CONFIRM'] } },
          { resource: 'USER', action: 'UPDATE_SELF' },
          { resource: 'COMMENT', action: { in: ['CREATE', 'READ'] } },
          { resource: 'ATTACHMENT', action: { in: ['CREATE', 'READ'] } },
          { resource: 'NOTIFICATION', action: 'READ' },
          { resource: 'DASHBOARD', action: 'READ' },
        ],
      },
    });
    await assignRolePermissions(
      'CLIENT_USER',
      clientUserPermissions.map((permission) => permission.id),
      clientUserRole.id
    );
  }
}

/**
 * 개발/E2E용 픽스처(테스트 계정, 고객사, 서비스 분류, 샘플 SR) 시딩.
 * 기존 계정의 비밀번호는 어떤 경우에도 덮어쓰지 않는다.
 */
async function seedDevFixtures() {
  // Create test users
  console.log('Creating test users...');

  const adminEmail = 'admin@example.com';
  let adminUser = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!adminUser) {
    // 기본값 없음: SEED_ADMIN_PASSWORD 가 없으면 관리자 계정을 만들지 않는다.
    const adminPassword = process.env.SEED_ADMIN_PASSWORD;

    if (!adminPassword) {
      console.log(
        'SEED_ADMIN_PASSWORD가 설정되지 않아 admin 계정 생성을 건너뜁니다. ' +
          '(생성하려면 SEED_ADMIN_PASSWORD를 지정하세요)'
      );
    } else {
      adminUser = await prisma.user.create({
        data: {
          email: adminEmail,
          name: 'Admin User',
          password: await hash(adminPassword, BCRYPT_WORK_FACTOR),
          notificationPreference: { create: {} }, // Add default preferences
        },
      });

      // Assign ADMIN role to user
      const adminRoleForUser = await prisma.role.findUnique({
        where: { name: 'ADMIN' },
      });

      if (adminRoleForUser) {
        await prisma.userRole.create({
          data: {
            userId: adminUser.id,
            roleId: adminRoleForUser.id,
          },
        });
      }

      console.log(`Created admin user: ${adminEmail}`);
    }
  } else {
    // 기존 계정의 비밀번호는 절대 재설정하지 않는다(운영자가 변경한 값 보존).
    await prisma.notificationPreference.upsert({
      where: { userId: adminUser.id },
      create: { userId: adminUser.id },
      update: {},
    });
    console.log('Admin user already exists, password left untouched');
  }

  // Create Engineer User for E2E tests
  const engineerEmail = 'engineeruser@example.com';
  const engineerUser = await prisma.user.findUnique({ where: { email: engineerEmail } });

  if (!engineerUser) {
    const engineerPassword = process.env.SEED_ENGINEER_PASSWORD;
    const created = await prisma.user.create({
      data: {
        email: engineerEmail,
        name: 'Engineer User',
        password: engineerPassword
          ? await hash(engineerPassword, BCRYPT_WORK_FACTOR)
          : ENGINEER_DEV_HASH,
        notificationPreference: { create: {} },
      },
    });
    // ENGINEER 역할 부여
    const engRole = await prisma.role.findUnique({ where: { name: 'ENGINEER' } });
    if (engRole) {
      await prisma.userRole.create({ data: { userId: created.id, roleId: engRole.id } });
    }
    console.log(`Created engineer user: ${engineerEmail}`);
  } else {
    // 알림 설정만 보정하고 비밀번호는 그대로 둔다.
    await prisma.notificationPreference.upsert({
      where: { userId: engineerUser.id },
      create: { userId: engineerUser.id },
      update: {},
    });
    console.log('Engineer user exists, password left untouched');
  }

  // Create Manager User for E2E tests (role-personas 프로젝트 계약).
  // e2e/helpers/auth-helpers.ts 의 `manager` 페르소나는 세션 역할이 정확히 ['MANAGER'] 여야 통과한다.
  // 따라서 ADMIN 등 다른 역할을 겸하게 만들면 안 되며, 고객사 소속도 부여하지 않는다.
  const managerEmail = 'manageruser@example.com';
  const managerUser = await prisma.user.findUnique({ where: { email: managerEmail } });

  if (!managerUser) {
    const managerPassword = process.env.SEED_MANAGER_PASSWORD;
    const created = await prisma.user.create({
      data: {
        email: managerEmail,
        name: 'Manager User',
        password: managerPassword
          ? await hash(managerPassword, BCRYPT_WORK_FACTOR)
          : MANAGER_DEV_HASH,
        notificationPreference: { create: {} },
      },
    });
    // MANAGER 역할만 부여(단일 역할)
    const mgrRole = await prisma.role.findUnique({ where: { name: 'MANAGER' } });
    if (mgrRole) {
      await prisma.userRole.create({ data: { userId: created.id, roleId: mgrRole.id } });
    }
    console.log(`Created manager user: ${managerEmail}`);
  } else {
    // 알림 설정만 보정하고 비밀번호/역할은 그대로 둔다.
    await prisma.notificationPreference.upsert({
      where: { userId: managerUser.id },
      create: { userId: managerUser.id },
      update: {},
    });
    console.log('Manager user exists, password left untouched');
  }

  if (!adminUser) {
    console.log('admin 계정이 없어 고객사/서비스 분류/샘플 SR 픽스처를 건너뜁니다.');
    return;
  }

  // 이후 단계는 admin 계정이 반드시 존재한다(위 가드 통과).
  const admin = adminUser;

  // Create test clients
  console.log('Creating test clients...');

  const existingClient = await prisma.client.findUnique({
    where: { code: 'TEST001' },
  });

  let testClient1, testClient2;

  if (!existingClient) {
    testClient1 = await prisma.client.create({
      data: {
        code: 'TEST001',
        name: '테스트 고객사 A',
        industry: 'IT 서비스',
        contactPerson: '김철수',
        contactEmail: 'contact@test-client-a.com',
        contactPhone: '02-1234-5678',
        isActive: true,
        users: {
          create: {
            userId: admin.id,
          },
        },
      },
    });

    testClient2 = await prisma.client.create({
      data: {
        code: 'TEST002',
        name: '테스트 고객사 B',
        industry: '제조업',
        contactPerson: '이영희',
        contactEmail: 'contact@test-client-b.com',
        contactPhone: '02-2345-6789',
        isActive: true,
        users: {
          create: {
            userId: admin.id,
          },
        },
      },
    });

    console.log('Created 2 test clients');
  } else {
    console.log('Test clients already exist');
    testClient1 = existingClient;
    testClient2 = await prisma.client.findUnique({
      where: { code: 'TEST002' },
    });
  }

  // Ensure Client User exists (Moved after test clients to ensure linking)
  const clientEmail = 'clientuser@example.com';
  let clientUser = await prisma.user.findUnique({ where: { email: clientEmail } });

  if (!clientUser) {
    const clientPassword = process.env.SEED_CLIENT_PASSWORD;
    clientUser = await prisma.user.create({
      data: {
        email: clientEmail,
        name: 'Client User',
        password: clientPassword ? await hash(clientPassword, BCRYPT_WORK_FACTOR) : CLIENT_DEV_HASH,
        notificationPreference: { create: {} }, // Add default preferences
      },
    });
    // CLIENT_USER 역할 부여
    const clientRole = await prisma.role.findUnique({ where: { name: 'CLIENT_USER' } });
    if (clientRole) {
      await prisma.userRole.create({ data: { userId: clientUser.id, roleId: clientRole.id } });
    }
    console.log(`Created client user: ${clientEmail}`);
  } else {
    // 알림 설정만 보정하고 비밀번호는 그대로 둔다.
    await prisma.notificationPreference.upsert({
      where: { userId: clientUser.id },
      create: { userId: clientUser.id },
      update: {},
    });
    console.log('Client user exists, password left untouched');
  }

  // Ensure client user is linked to TEST001
  if (clientUser && testClient1) {
    const existingLink = await prisma.userClient.findUnique({
      where: {
        userId_clientId: {
          userId: clientUser.id,
          clientId: testClient1.id,
        },
      },
    });

    if (!existingLink) {
      await prisma.userClient.create({
        data: {
          userId: clientUser.id,
          clientId: testClient1.id,
        },
      });
      console.log('Linked client user to TEST001');
    }
  }

  // Create Client Admin User for E2E tests (role-personas 프로젝트 계약).
  // 세션 역할이 정확히 ['CLIENT_ADMIN'] 이어야 하고, 소속 고객사가 최소 1개 있어야 한다
  // (minClientIds: 1). 소속은 TEST001 **한 곳만** 부여한다 — TEST002 를 "다른 테넌트"로
  // 남겨 두어야 교차 테넌트 회귀(자사 외 SR/사용자 조회, clientIds 상향)를 잡을 수 있다.
  const clientAdminEmail = 'clientadminuser@example.com';
  let clientAdminUser = await prisma.user.findUnique({ where: { email: clientAdminEmail } });

  if (!clientAdminUser) {
    const clientAdminPassword = process.env.SEED_CLIENT_ADMIN_PASSWORD;
    clientAdminUser = await prisma.user.create({
      data: {
        email: clientAdminEmail,
        name: 'Client Admin User',
        password: clientAdminPassword
          ? await hash(clientAdminPassword, BCRYPT_WORK_FACTOR)
          : CLIENT_ADMIN_DEV_HASH,
        notificationPreference: { create: {} },
      },
    });
    // CLIENT_ADMIN 역할만 부여(단일 역할)
    const clientAdminRole = await prisma.role.findUnique({ where: { name: 'CLIENT_ADMIN' } });
    if (clientAdminRole) {
      await prisma.userRole.create({
        data: { userId: clientAdminUser.id, roleId: clientAdminRole.id },
      });
    }
    console.log(`Created client admin user: ${clientAdminEmail}`);
  } else {
    // 알림 설정만 보정하고 비밀번호/역할은 그대로 둔다.
    await prisma.notificationPreference.upsert({
      where: { userId: clientAdminUser.id },
      create: { userId: clientAdminUser.id },
      update: {},
    });
    console.log('Client admin user exists, password left untouched');
  }

  // Ensure client admin user is linked to TEST001 only (TEST002 는 의도적으로 제외)
  if (clientAdminUser && testClient1) {
    const existingAdminLink = await prisma.userClient.findUnique({
      where: {
        userId_clientId: {
          userId: clientAdminUser.id,
          clientId: testClient1.id,
        },
      },
    });

    if (!existingAdminLink) {
      await prisma.userClient.create({
        data: {
          userId: clientAdminUser.id,
          clientId: testClient1.id,
        },
      });
      console.log('Linked client admin user to TEST001');
    }
  }

  // Create service categories for test clients (always check)
  console.log('Creating service categories...');

  const existingCategories = await prisma.serviceCategory.count({
    where: {
      clientId: {
        in: [testClient1!.id, testClient2!.id],
      },
    },
  });

  if (existingCategories === 0) {
    await prisma.serviceCategory.createMany({
      data: [
        {
          clientId: testClient1!.id,
          categoryName: '기술 지원',
          description: '기술적 문제 해결 및 지원',
          slaHours: 24,
          priority: 'HIGH',
        },
        {
          clientId: testClient1!.id,
          categoryName: '버그 수정',
          description: '소프트웨어 버그 수정 요청',
          slaHours: 48,
          priority: 'MEDIUM',
        },
        {
          clientId: testClient1!.id,
          categoryName: '기능 개선',
          description: '기존 기능 개선 및 최적화',
          slaHours: 72,
          priority: 'LOW',
        },
        {
          clientId: testClient2!.id,
          categoryName: '시스템 문의',
          description: '시스템 관련 문의사항',
          slaHours: 24,
          priority: 'MEDIUM',
        },
        {
          clientId: testClient2!.id,
          categoryName: '데이터 처리',
          description: '데이터 처리 및 분석 요청',
          slaHours: 48,
          priority: 'MEDIUM',
        },
      ],
    });

    console.log('Created 5 service categories');
  } else {
    console.log(`Service categories already exist (${existingCategories} found)`);
  }

  // Create sample SRs with activities and status history
  console.log('Creating sample SRs with activities...');

  const existingSRs = await prisma.sR.count();

  if (existingSRs === 0 && testClient1) {
    const category = await prisma.serviceCategory.findFirst({
      where: { clientId: testClient1.id },
    });

    if (category) {
      // SR 1: IN_PROGRESS
      const sr1 = await prisma.sR.create({
        data: {
          srNumber: 'SR-2024-001',
          title: '시스템 로그인 오류 해결 요청',
          description: '특정 사용자 계정에서 로그인 시 오류가 발생합니다. 빠른 확인 부탁드립니다.',
          status: 'IN_PROGRESS',
          requestedPriority: 'HIGH',
          actualPriority: 'HIGH',
          clientId: testClient1.id,
          serviceCategoryId: category.id,
          requesterId: admin.id,
          assigneeId: admin.id,
          intakeById: admin.id,
          intakeAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2일 전
        },
      });

      // SR 1 Activities
      await prisma.sRActivity.createMany({
        data: [
          {
            srId: sr1.id,
            userId: admin.id,
            type: 'CREATED',
            description: 'SR이 생성되었습니다',
            createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          },
          {
            srId: sr1.id,
            userId: admin.id,
            type: 'ASSIGNED',
            description: '담당자가 할당되었습니다',
            createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 1000),
          },
          {
            srId: sr1.id,
            userId: admin.id,
            type: 'STATUS_CHANGED',
            description: '상태가 IN_PROGRESS로 변경되었습니다',
            createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
          },
        ],
      });

      // SR 1 Status History
      await prisma.sRStatusHistory.createMany({
        data: [
          {
            srId: sr1.id,
            currentStatus: 'REQUESTED',
            changedBy: admin.id,
            changeReason: '초기 생성',
            changedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          },
          {
            srId: sr1.id,
            previousStatus: 'REQUESTED',
            currentStatus: 'IN_PROGRESS',
            changedBy: admin.id,
            changeReason: '작업 시작',
            changedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
          },
        ],
      });

      // SR 2: COMPLETED
      const sr2 = await prisma.sR.create({
        data: {
          srNumber: 'SR-2024-002',
          title: '데이터 백업 요청',
          description: '월말 정기 데이터 백업을 요청합니다.',
          status: 'COMPLETED',
          requestedPriority: 'MEDIUM',
          actualPriority: 'MEDIUM',
          clientId: testClient1.id,
          serviceCategoryId: category.id,
          requesterId: admin.id,
          assigneeId: admin.id,
          intakeById: admin.id,
          intakeAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          completedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        },
      });

      await prisma.sRActivity.createMany({
        data: [
          {
            srId: sr2.id,
            userId: admin.id,
            type: 'CREATED',
            description: 'SR이 생성되었습니다',
            createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          },
          {
            srId: sr2.id,
            userId: admin.id,
            type: 'STATUS_CHANGED',
            description: '상태가 COMPLETED로 변경되었습니다',
            createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
          },
        ],
      });

      await prisma.sRStatusHistory.createMany({
        data: [
          {
            srId: sr2.id,
            currentStatus: 'REQUESTED',
            changedBy: admin.id,
            changeReason: '초기 생성',
            changedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          },
          {
            srId: sr2.id,
            previousStatus: 'REQUESTED',
            currentStatus: 'IN_PROGRESS',
            changedBy: admin.id,
            changeReason: '작업 시작',
            changedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          },
          {
            srId: sr2.id,
            previousStatus: 'IN_PROGRESS',
            currentStatus: 'COMPLETED',
            changedBy: admin.id,
            changeReason: '작업 완료',
            changedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
          },
        ],
      });

      // SR 3: REQUESTED (대기 중)
      const sr3 = await prisma.sR.create({
        data: {
          srNumber: 'SR-2024-003',
          title: '신규 기능 개발 문의',
          description: '대시보드에 차트 기능 추가를 요청합니다.',
          status: 'REQUESTED',
          requestedPriority: 'LOW',
          clientId: testClient1.id,
          serviceCategoryId: category.id,
          requesterId: admin.id,
        },
      });

      await prisma.sRActivity.create({
        data: {
          srId: sr3.id,
          userId: admin.id,
          type: 'CREATED',
          description: 'SR이 생성되었습니다',
        },
      });

      await prisma.sRStatusHistory.create({
        data: {
          srId: sr3.id,
          currentStatus: 'REQUESTED',
          changedBy: admin.id,
          changeReason: '초기 생성',
        },
      });

      console.log('Created 3 sample SRs with activities and status history');
    }
  } else {
    console.log(`Sample SRs already exist (${existingSRs} found)`);
  }
}

/**
 * 프로덕션 부트스트랩 관리자 생성 (감사 3.4).
 *
 * 깨끗한 DB 로 배포하면 마이그레이션은 성공하고 앱도 정상 부팅하지만, **admin 이 없어
 * 아무도 로그인할 수 없고** `/register` 도 기본 역할을 못 찾아 실패한다. 인스턴스가
 * 영구히 사용 불가 상태가 되는데 문서화된 복구 절차도 없었다.
 *
 * **왜 "최초 등록자 자동 승격" 이 아니라 env 방식인가:**
 * 최초 가입자를 ADMIN 으로 올리는 방식은 인스턴스가 인터넷에 노출된 상태에서 소유자보다
 * 먼저 가입한 사람이 관리자가 되는 경쟁 조건을 만든다. env 로 명시하면 그 창이 없다.
 *
 * 안전장치:
 * - ADMIN 역할을 가진 사용자가 **이미 하나라도 있으면 아무것도 하지 않는다.**
 * - 같은 이메일의 기존 사용자가 있으면 비밀번호를 덮어쓰지 않는다(역할만 보강).
 * - 두 env 가 모두 있어야 동작한다.
 */
async function bootstrapAdmin() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!email || !password) return;

  const adminRole = await prisma.role.findUnique({ where: { name: 'ADMIN' } });
  if (!adminRole) {
    console.log('ADMIN 역할이 없어 부트스트랩을 건너뜁니다(기준 데이터 시딩 실패?).');
    return;
  }

  const existingAdminCount = await prisma.userRole.count({
    where: { roleId: adminRole.id },
  });
  if (existingAdminCount > 0) {
    console.log(`ADMIN 이 이미 ${existingAdminCount}명 있어 부트스트랩을 건너뜁니다.`);
    return;
  }

  if (password.length < 12) {
    console.log('BOOTSTRAP_ADMIN_PASSWORD 가 12자 미만이라 부트스트랩을 중단합니다.');
    return;
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (existingUser) {
    // 비밀번호는 건드리지 않는다 — 운영자가 바꿔 둔 값을 되돌리면 안 된다.
    await prisma.userRole.create({
      data: { userId: existingUser.id, roleId: adminRole.id },
    });
    console.log(`기존 사용자 ${email} 에게 ADMIN 역할을 부여했습니다(비밀번호는 유지).`);
    return;
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: process.env.BOOTSTRAP_ADMIN_NAME || '시스템 관리자',
      password: await hash(password, BCRYPT_WORK_FACTOR),
      isActive: true,
      notificationPreference: { create: {} },
      roles: { create: { roleId: adminRole.id } },
    },
  });

  console.log(`부트스트랩 ADMIN 을 생성했습니다: ${user.email}`);
  console.log(
    '보안: 로그인 후 비밀번호를 변경하고, BOOTSTRAP_ADMIN_PASSWORD 환경변수를 제거하세요.'
  );
}

async function main() {
  console.log('Starting seed...');

  await seedReferenceData();

  // 기준 데이터 이후에 실행해야 ADMIN 역할이 존재한다.
  await bootstrapAdmin();

  if (!shouldSeedDevFixtures) {
    console.log(
      '개발용 픽스처를 건너뜁니다(기준 데이터만 시딩). ' +
        '필요 시 비프로덕션 환경에서 SEED_DEV_FIXTURES=true 로 실행하세요.'
    );
    console.log('Seed completed successfully!');
    return;
  }

  await seedDevFixtures();

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
