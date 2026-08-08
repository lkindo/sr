import 'server-only';

import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';

/**
 * 역할 이름 → 권한 문자열(`RESOURCE:ACTION`) 맵.
 *
 * **왜 있는가.** 예전에는 사용자의 권한 목록을 세션 JWT 안에 통째로 넣었다. ADMIN 은
 * 권한이 30개가 넘어 암호화된 세션 쿠키가 수 KB 가 됐고, nginx 의 기본 4k 헤더 버퍼를
 * 넘겨 **로그인한 사용자만 502** 를 받는 장애가 났다(2026-08-08). 버퍼를 올려도 권한이
 * 늘면 같은 자리에 다시 닿는다 — 쿠키에 담지 않는 것이 답이다.
 *
 * 이제 토큰에는 역할 이름만 들어가고(보통 1~2개), 권한은 요청 시점에 이 맵으로 편다.
 * 확장은 `auth.ts` 의 `session` 콜백에서 일어나므로 **소비처는 아무것도 바뀌지 않는다** —
 * `session.user.permissions` 는 예전과 똑같이 채워진 상태로 도착한다.
 *
 * **왜 캐시하는가.** 역할은 5개 안팎이고 권한 배정은 거의 바뀌지 않는데, 세션은 매
 * 요청마다 읽힌다. 캐시가 없으면 요청당 조인 쿼리가 하나씩 붙는다.
 *
 * **왜 TTL 만으로 끝내지 않는가.** 권한 배정은 런타임에 바뀐다
 * (`role.service.ts` 의 updateRolePermissions → rolePermission deleteMany/createMany).
 * TTL 만 두면 권한을 회수해도 최대 TTL 만큼 유효한 창이 남는다. 그건 인가에서
 * 받아들일 수 없는 종류의 지연이라, 변경 지점에서 `invalidateRolePermissions()` 를
 * 명시적으로 호출해 즉시 무효화한다. TTL 은 그 호출을 빠뜨렸을 때를 위한 안전망이다.
 */

/** 캐시 수명. 무효화 호출을 빠뜨렸을 때의 최대 노출 시간이기도 하다. */
const CACHE_TTL_MS = 60_000;

let cache: { map: Map<string, string[]>; loadedAt: number } | null = null;

/** 진행 중인 로드. 동시 요청이 같은 쿼리를 여러 번 던지지 않게 공유한다. */
let inFlight: Promise<Map<string, string[]>> | null = null;

async function loadRolePermissionMap(): Promise<Map<string, string[]>> {
  const roles = await prisma.role.findMany({
    select: {
      name: true,
      permissions: {
        select: { permission: { select: { resource: true, action: true } } },
      },
    },
  });

  const map = new Map<string, string[]>();
  for (const role of roles) {
    map.set(
      role.name,
      role.permissions.map((rp) => `${rp.permission.resource}:${rp.permission.action}`)
    );
  }
  return map;
}

async function getMap(): Promise<Map<string, string[]>> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache.map;
  }

  // 동시에 여러 요청이 만료를 발견해도 쿼리는 한 번만 나간다.
  inFlight ??= loadRolePermissionMap()
    .then((map) => {
      cache = { map, loadedAt: Date.now() };
      return map;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/**
 * 역할 이름 목록을 권한 문자열 집합으로 편다.
 *
 * 조회가 실패하면 **빈 배열**을 돌려준다. 정책 계층이 fail-closed 라 그 결과는
 * "아무 권한도 없음" 이 되고, 접근이 열리는 방향으로는 절대 실패하지 않는다.
 * (역할 기반 판정은 토큰의 roles 로 계속 동작하므로 화면 전체가 막히지는 않는다.)
 */
export async function expandRolePermissions(roleNames: string[]): Promise<string[]> {
  if (roleNames.length === 0) return [];

  let map: Map<string, string[]>;
  try {
    map = await getMap();
  } catch (error) {
    logger.error(
      '[auth] 역할→권한 맵 조회 실패. 이번 요청은 권한 없음으로 처리한다.',
      error instanceof Error ? error : new Error(String(error))
    );
    return [];
  }

  const granted = new Set<string>();
  for (const roleName of roleNames) {
    for (const permission of map.get(roleName) ?? []) {
      granted.add(permission);
    }
  }
  return Array.from(granted);
}

/**
 * 캐시를 즉시 버린다. 역할의 권한 배정을 바꾼 직후에 호출한다.
 *
 * 이걸 빠뜨리면 회수한 권한이 최대 CACHE_TTL_MS 동안 살아 있는다.
 */
export function invalidateRolePermissions(): void {
  cache = null;
}
