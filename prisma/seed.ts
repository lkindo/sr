import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

const permissions = [
  // SR 관련 권한
  { resource: "SR", action: "CREATE", description: "SR 생성" },
  { resource: "SR", action: "READ", description: "SR 조회" },
  { resource: "SR", action: "UPDATE", description: "SR 수정" },
  { resource: "SR", action: "DELETE", description: "SR 삭제" },
  { resource: "SR", action: "ASSIGN", description: "SR 담당자 할당" },
  { resource: "SR", action: "STATUS_CHANGE", description: "SR 상태 변경" },

  // 고객사 관련 권한
  { resource: "CLIENT", action: "CREATE", description: "고객사 생성" },
  { resource: "CLIENT", action: "READ", description: "고객사 조회" },
  { resource: "CLIENT", action: "UPDATE", description: "고객사 수정" },
  { resource: "CLIENT", action: "DELETE", description: "고객사 삭제" },

  // 사용자 관련 권한
  { resource: "USER", action: "CREATE", description: "사용자 생성" },
  { resource: "USER", action: "READ", description: "사용자 조회" },
  { resource: "USER", action: "UPDATE", description: "사용자 수정" },
  { resource: "USER", action: "DELETE", description: "사용자 삭제" },
  { resource: "USER", action: "ASSIGN_ROLE", description: "역할 할당" },

  // 역할 관련 권한
  { resource: "ROLE", action: "CREATE", description: "역할 생성" },
  { resource: "ROLE", action: "READ", description: "역할 조회" },
  { resource: "ROLE", action: "UPDATE", description: "역할 수정" },
  { resource: "ROLE", action: "DELETE", description: "역할 삭제" },
  { resource: "ROLE", action: "ASSIGN_PERMISSION", description: "권한 할당" },

  // 댓글 관련 권한
  { resource: "COMMENT", action: "CREATE", description: "댓글 생성" },
  { resource: "COMMENT", action: "READ", description: "댓글 조회" },
  { resource: "COMMENT", action: "UPDATE", description: "댓글 수정" },
  { resource: "COMMENT", action: "DELETE", description: "댓글 삭제" },

  // 첨부파일 관련 권한
  { resource: "ATTACHMENT", action: "CREATE", description: "첨부파일 업로드" },
  { resource: "ATTACHMENT", action: "READ", description: "첨부파일 조회" },
  { resource: "ATTACHMENT", action: "DELETE", description: "첨부파일 삭제" },

  // 알림 관련 권한
  { resource: "NOTIFICATION", action: "READ", description: "알림 조회" },
  { resource: "NOTIFICATION", action: "UPDATE", description: "알림 상태 변경" },

  // 대시보드 관련 권한
  { resource: "DASHBOARD", action: "READ", description: "대시보드 조회" },
  { resource: "DASHBOARD", action: "ANALYTICS", description: "분석 데이터 조회" },
];

const roles = [
  {
    name: "ADMIN",
    description: "시스템 관리자 - 모든 권한",
  },
  {
    name: "MANAGER",
    description: "매니저 - SR 관리 및 사용자 관리",
  },
  {
    name: "ENGINEER",
    description: "엔지니어 - SR 처리",
  },
  {
    name: "CLIENT_ADMIN",
    description: "고객사 관리자 - 자사 SR 관리",
  },
  {
    name: "CLIENT_USER",
    description: "고객사 사용자 - SR 생성 및 조회",
  },
];

async function main() {
  console.log("Starting seed...");

  // Create permissions
  console.log("Creating permissions...");
  for (const permission of permissions) {
    await prisma.permission.upsert({
      where: {
        resource_action: {
          resource: permission.resource,
          action: permission.action,
        },
      },
      update: {},
      create: permission,
    });
  }
  console.log(`Created ${permissions.length} permissions`);

  // Create roles
  console.log("Creating roles...");
  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: role,
    });
  }
  console.log(`Created ${roles.length} roles`);

  // Assign all permissions to ADMIN role
  console.log("Assigning permissions to ADMIN role...");
  const adminRole = await prisma.role.findUnique({
    where: { name: "ADMIN" },
  });

  if (adminRole) {
    const allPermissions = await prisma.permission.findMany();

    // Delete existing role permissions
    await prisma.rolePermission.deleteMany({
      where: { roleId: adminRole.id },
    });

    // Create new role permissions
    await prisma.rolePermission.createMany({
      data: allPermissions.map((permission) => ({
        roleId: adminRole.id,
        permissionId: permission.id,
      })),
    });
    console.log(`Assigned ${allPermissions.length} permissions to ADMIN role`);
  }

  // Assign permissions to MANAGER role
  console.log("Assigning permissions to MANAGER role...");
  const managerRole = await prisma.role.findUnique({
    where: { name: "MANAGER" },
  });

  if (managerRole) {
    const managerPermissions = await prisma.permission.findMany({
      where: {
        OR: [
          { resource: "SR" },
          { resource: "CLIENT", action: { in: ["READ", "UPDATE"] } },
          { resource: "USER", action: { in: ["READ", "UPDATE", "ASSIGN_ROLE"] } },
          { resource: "COMMENT" },
          { resource: "ATTACHMENT" },
          { resource: "DASHBOARD" },
          { resource: "NOTIFICATION" },
        ],
      },
    });

    await prisma.rolePermission.deleteMany({
      where: { roleId: managerRole.id },
    });

    await prisma.rolePermission.createMany({
      data: managerPermissions.map((permission) => ({
        roleId: managerRole.id,
        permissionId: permission.id,
      })),
    });
    console.log(`Assigned ${managerPermissions.length} permissions to MANAGER role`);
  }

  // Assign permissions to ENGINEER role
  console.log("Assigning permissions to ENGINEER role...");
  const engineerRole = await prisma.role.findUnique({
    where: { name: "ENGINEER" },
  });

  if (engineerRole) {
    const engineerPermissions = await prisma.permission.findMany({
      where: {
        OR: [
          { resource: "SR", action: { in: ["READ", "UPDATE", "STATUS_CHANGE"] } },
          { resource: "CLIENT", action: "READ" },
          { resource: "COMMENT" },
          { resource: "ATTACHMENT" },
          { resource: "NOTIFICATION", action: "READ" },
          { resource: "DASHBOARD", action: "READ" },
        ],
      },
    });

    await prisma.rolePermission.deleteMany({
      where: { roleId: engineerRole.id },
    });

    await prisma.rolePermission.createMany({
      data: engineerPermissions.map((permission) => ({
        roleId: engineerRole.id,
        permissionId: permission.id,
      })),
    });
    console.log(`Assigned ${engineerPermissions.length} permissions to ENGINEER role`);
  }

  // Assign permissions to CLIENT_ADMIN role
  console.log("Assigning permissions to CLIENT_ADMIN role...");
  const clientAdminRole = await prisma.role.findUnique({
    where: { name: "CLIENT_ADMIN" },
  });

  if (clientAdminRole) {
    const clientAdminPermissions = await prisma.permission.findMany({
      where: {
        OR: [
          { resource: "SR" },
          { resource: "CLIENT", action: "READ" },
          { resource: "USER", action: { in: ["READ", "UPDATE"] } },
          { resource: "COMMENT" },
          { resource: "ATTACHMENT" },
          { resource: "NOTIFICATION" },
          { resource: "DASHBOARD", action: "READ" },
        ],
      },
    });

    await prisma.rolePermission.deleteMany({
      where: { roleId: clientAdminRole.id },
    });

    await prisma.rolePermission.createMany({
      data: clientAdminPermissions.map((permission) => ({
        roleId: clientAdminRole.id,
        permissionId: permission.id,
      })),
    });
    console.log(`Assigned ${clientAdminPermissions.length} permissions to CLIENT_ADMIN role`);
  }

  // Assign permissions to CLIENT_USER role
  console.log("Assigning permissions to CLIENT_USER role...");
  const clientUserRole = await prisma.role.findUnique({
    where: { name: "CLIENT_USER" },
  });

  if (clientUserRole) {
    const clientUserPermissions = await prisma.permission.findMany({
      where: {
        OR: [
          { resource: "SR", action: { in: ["CREATE", "READ"] } },
          { resource: "COMMENT", action: { in: ["CREATE", "READ"] } },
          { resource: "ATTACHMENT", action: { in: ["CREATE", "READ"] } },
          { resource: "NOTIFICATION", action: "READ" },
        ],
      },
    });

    await prisma.rolePermission.deleteMany({
      where: { roleId: clientUserRole.id },
    });

    await prisma.rolePermission.createMany({
      data: clientUserPermissions.map((permission) => ({
        roleId: clientUserRole.id,
        permissionId: permission.id,
      })),
    });
    console.log(`Assigned ${clientUserPermissions.length} permissions to CLIENT_USER role`);
  }

  console.log("Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("Error during seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
