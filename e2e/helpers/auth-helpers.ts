import { expect, type Page } from '@playwright/test';
import path from 'path';

/**
 * E2E 페르소나 정의 및 세션 역할 검증 헬퍼.
 *
 * 이 파일이 "어떤 페르소나가 실제로 어떤 계정/역할인가"에 대한 단일 진실 공급원이다.
 * 페르소나 이름이 아니라 `expectedRoles`가 계약이며, 로그인 직후 실제 세션과 대조된다.
 *
 * 배경(감사 지적 3.38): `manager` 페르소나는 이름과 달리 admin@example.com(ADMIN)으로
 * 로그인해 왔다. 그 결과 MANAGER / CLIENT_ADMIN 두 역할은 단 한 번도 E2E로 검증된 적이 없다.
 * 아래 `assertSessionRoles`가 그 재발을 막는 영구적 장치다.
 */

const AUTH_DIR = path.join(__dirname, '../../playwright/.auth');

/** 페르소나 정의 */
export interface Persona {
  /** 로그 및 테스트 제목에 쓰이는 식별자 */
  name: string;
  /** 로그인 이메일 */
  email: string;
  /** 로그인 비밀번호 */
  password: string;
  /** storageState 저장 경로 */
  authFile: string;
  /**
   * 이 계정이 보유해야 하는 역할의 "정확한" 집합.
   * 부분 일치가 아니라 완전 일치로 검증한다 — MANAGER 페르소나가 ADMIN을 겸하는 순간 실패해야 한다.
   */
  expectedRoles: string[];
  /** 최소 소속 고객사 수 (테넌트 경계 테스트에 필요한 페르소나만 지정) */
  minClientIds?: number;
  /**
   * 시드에 아직 존재하지 않아 seed 계약에 의존하는 페르소나 여부.
   * true인 페르소나는 별도 setup 프로젝트로 격리되어 기존 스위트를 막지 않는다.
   */
  requiresSeedContract?: boolean;
}

/**
 * 단일 사용자 스위트가 쓰는 관리자 페르소나 (playwright/.auth/user.json).
 */
export const ADMIN_PERSONA: Persona = {
  name: 'admin',
  email: process.env.TEST_USER_EMAIL || 'admin@example.com',
  password: process.env.TEST_USER_PASSWORD || 'admin123',
  authFile: path.join(AUTH_DIR, 'user.json'),
  expectedRoles: ['ADMIN'],
};

/**
 * 기존(레거시) 페르소나.
 *
 * 주의: `legacyManager`의 authFile은 manager.json 이지만 실제 계정은 ADMIN이다.
 * 이름을 고치는 대신 `expectedRoles: ['ADMIN']`로 사실을 명시해 박제한다.
 * 기존 스펙 다수가 manager.json에 관리자 권한을 기대하므로 계정 자체는 바꾸지 않는다.
 */
export const LEGACY_PERSONAS: Persona[] = [
  {
    name: 'client',
    email: process.env.TEST_CLIENT_EMAIL || 'clientuser@example.com',
    password: process.env.TEST_CLIENT_PASSWORD || 'client123',
    authFile: path.join(AUTH_DIR, 'client.json'),
    expectedRoles: ['CLIENT_USER'],
    minClientIds: 1,
  },
  {
    // 레거시 별칭: 파일명은 manager지만 내용은 ADMIN 세션이다.
    name: 'legacy-manager (ADMIN 별칭)',
    email: process.env.TEST_MANAGER_EMAIL || 'admin@example.com',
    password: process.env.TEST_MANAGER_PASSWORD || 'admin123',
    authFile: path.join(AUTH_DIR, 'manager.json'),
    expectedRoles: ['ADMIN'],
  },
  {
    name: 'engineer',
    email: process.env.TEST_ENGINEER_EMAIL || 'engineeruser@example.com',
    password: process.env.TEST_ENGINEER_PASSWORD || 'engineer123',
    authFile: path.join(AUTH_DIR, 'engineer.json'),
    expectedRoles: ['ENGINEER'],
  },
];

/**
 * 신규 역할 페르소나 — MANAGER / CLIENT_ADMIN.
 *
 * 두 계정은 현재 prisma/seed.ts에 존재하지 않는다(seed는 ADMIN/ENGINEER/CLIENT_USER 3명만 생성).
 * seed 소유자가 아래 계약대로 계정을 추가하기 전까지 이 페르소나의 setup은 실패한다.
 * 실패는 의도된 것이며, 별도 프로젝트로 격리되어 다른 스펙을 막지 않는다.
 */
export const ROLE_PERSONAS: Persona[] = [
  {
    name: 'manager',
    email: process.env.TEST_MANAGER_ROLE_EMAIL || 'manageruser@example.com',
    password: process.env.TEST_MANAGER_ROLE_PASSWORD || 'manager123',
    authFile: path.join(AUTH_DIR, 'manager-role.json'),
    expectedRoles: ['MANAGER'],
    requiresSeedContract: true,
  },
  {
    name: 'client-admin',
    email: process.env.TEST_CLIENT_ADMIN_EMAIL || 'clientadminuser@example.com',
    password: process.env.TEST_CLIENT_ADMIN_PASSWORD || 'clientadmin123',
    authFile: path.join(AUTH_DIR, 'client-admin.json'),
    expectedRoles: ['CLIENT_ADMIN'],
    // 테넌트 경계 회귀(자사 외 데이터 조회/ clientIds 상향)를 잡으려면 소속이 반드시 있어야 한다.
    minClientIds: 1,
    requiresSeedContract: true,
  },
];

export const ALL_PERSONAS: Persona[] = [...LEGACY_PERSONAS, ...ROLE_PERSONAS];

/** 페르소나별 storageState 경로 (스펙에서 test.use 에 바로 사용) */
export const PERSONA_AUTH_FILES = {
  admin: path.join(AUTH_DIR, 'user.json'),
  /** @deprecated 실제 내용은 ADMIN 세션이다. 진짜 MANAGER는 `manager`를 사용할 것. */
  legacyManager: path.join(AUTH_DIR, 'manager.json'),
  engineer: path.join(AUTH_DIR, 'engineer.json'),
  client: path.join(AUTH_DIR, 'client.json'),
  manager: path.join(AUTH_DIR, 'manager-role.json'),
  clientAdmin: path.join(AUTH_DIR, 'client-admin.json'),
} as const;

export type PersonaKey = keyof typeof PERSONA_AUTH_FILES;

/** NextAuth 세션 응답에서 우리가 사용하는 부분만 */
interface SessionPayload {
  user?: {
    email?: string;
    roles?: string[];
    clientIds?: string[];
  };
}

/**
 * 현재 페이지 컨텍스트의 NextAuth 세션을 조회한다.
 * JWT 전략이므로 /api/auth/session 응답이 곧 session 콜백의 결과(roles/clientIds 포함)다.
 */
export async function fetchSession(page: Page): Promise<SessionPayload> {
  const response = await page.request.get('/api/auth/session');

  if (!response.ok()) {
    throw new Error(`세션 조회 실패: HTTP ${response.status()} ${response.statusText()}`);
  }

  return (await response.json()) as SessionPayload;
}

/**
 * 로그인으로 만들어진 세션이 "정말로" 기대한 계정/역할인지 검증한다.
 *
 * 이 단언이 없으면 시드가 바뀌었을 때 페르소나가 조용히 다른 역할로 바뀌어도 아무도 모른다.
 * (감사 지적 3.38이 정확히 그 사고였다.)
 */
export async function assertSessionRoles(page: Page, persona: Persona): Promise<void> {
  const session = await fetchSession(page);
  const user = session.user;

  const seedHint = persona.requiresSeedContract
    ? ` (prisma/seed.ts에 ${persona.email} 계정과 ${persona.expectedRoles.join('/')} 역할이 필요합니다)`
    : '';

  if (!user) {
    throw new Error(`${persona.name}: 로그인 후에도 세션이 비어 있습니다${seedHint}`);
  }

  // 다른 계정으로 로그인된 채 지나가는 것을 막는다.
  expect(user.email, `${persona.name} 페르소나의 세션 이메일 불일치${seedHint}`).toBe(
    persona.email
  );

  // 역할은 부분 일치가 아니라 완전 일치 — 권한 상향(예: MANAGER가 ADMIN 겸직)도 실패로 잡는다.
  const actualRoles = [...(user.roles ?? [])].sort();
  const expectedRoles = [...persona.expectedRoles].sort();
  expect(
    actualRoles,
    `${persona.name} 페르소나의 역할 불일치: 기대 ${JSON.stringify(expectedRoles)}, 실제 ${JSON.stringify(actualRoles)}${seedHint}`
  ).toEqual(expectedRoles);

  if (persona.minClientIds !== undefined) {
    const clientIds = user.clientIds ?? [];
    expect(
      clientIds.length,
      `${persona.name} 페르소나의 고객사 소속이 부족합니다${seedHint}`
    ).toBeGreaterThanOrEqual(persona.minClientIds);
  }
}

/**
 * 로그인 폼을 채우고 인증된 페이지로 이동할 때까지 대기한다.
 *
 * 로그인 폼 입력에는 name 속성이 없고 id만 있으므로 반드시 #email / #password 를 써야 한다.
 */
export async function loginAs(page: Page, persona: Persona): Promise<void> {
  await page.goto('/login');

  await page.fill('#email', persona.email);
  await page.fill('#password', persona.password);
  await page.locator('button[type="submit"]').click();

  try {
    await page.waitForURL(/\/(dashboard|srs|clients|users|settings)/, { timeout: 60000 });
  } catch {
    const currentUrl = page.url();
    const errorAlert = page.locator('[role="alert"]');

    if (await errorAlert.isVisible({ timeout: 2000 }).catch(() => false)) {
      const errorText = await errorAlert.textContent();
      throw new Error(`${persona.name} 로그인 실패: ${errorText} (URL: ${currentUrl})`);
    }

    if (currentUrl.includes('/login')) {
      throw new Error(
        `${persona.name} 로그인 실패: 여전히 로그인 페이지에 있음 (URL: ${currentUrl})`
      );
    }

    console.log(`⚠️ ${persona.name} 예상치 못한 URL로 이동: ${currentUrl}`);
  }
}
