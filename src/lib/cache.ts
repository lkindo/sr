import { unstable_cache as cache } from 'next/cache';

import prisma from '@/lib/prisma';
import { UserService } from '@/services/user.service';

/**
 * Next.js unstable_cache 기반 캐시 유틸리티
 * Redis 제거 후 간소화된 버전
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 스코핑 규칙(감사 4.2)
 *
 * 예전에는 두 헬퍼가 테넌트 필터도 `take` 도 없이 **모든** 활성 사용자·고객사를
 * 반환했고, `/srs` 페이지가 이를 무조건 호출해 `<SRsDataTable>` 의 prop 으로 넘겼다.
 * 그 결과 CLIENT_USER 가 목록 화면을 열기만 해도 시스템 내 모든 활성 사용자의
 * **id·이름·이메일**과 전 고객사 목록이 RSC 페이로드로 브라우저에 전달됐다.
 * 같은 페이지가 SR 쿼리는 clientId 로 신중히 스코프하면서 이 두 조회만 빠져 있었다.
 *
 * 지금은 두 가지를 바꿨다.
 *   1. `email` 을 select 에서 제거했다. 두 드롭다운 모두 `id` 와 `name` 만 렌더링하므로
 *      이메일은 애초에 쓰이지 않았고, 노출만 됐다.
 *   2. 호출자가 스코프를 명시한다. `unstable_cache` 는 keyParts 와 **함께 인자도**
 *      캐시 키에 포함하므로, 테넌트별로 캐시 엔트리가 분리된다.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * 담당자 필터에 넣을 사용자 목록.
 *
 * "활성 사용자 전원" 이 아니라 **실제로 담당자가 될 수 있는 사용자**만 반환한다.
 * 배정 검증(`assertAssignable`)과 같은 원천을 쓰므로, 드롭다운에 떴는데 배정하면
 * 거부당하는 발산이 생기지 않는다. 다른 테넌트의 고객사 사용자는 애초에 담당자가
 * 될 수 없으므로 이 목록에 들어오지 않는다 — 스코핑이 부수 효과로 따라온다.
 */
export const getCachedAssignableUsers = cache(
  async () => {
    const users = await new UserService().getUsersWithSRHandlingPermission();
    // 이메일은 드롭다운이 쓰지 않는다. 클라이언트로 내보내지 않는다.
    return users.map(({ id, name }) => ({ id, name }));
  },
  ['assignable-users'],
  { revalidate: 300 } // 5분마다 갱신
);

/**
 * 고객사 필터에 넣을 목록.
 *
 * @param clientIds - `undefined` 면 전체(내부 사용자 전용).
 *   배열이면 그 고객사들로 제한한다. 빈 배열은 빈 결과다 — 소속 없는 외부 사용자에게
 *   전체 목록을 주지 않기 위해, `undefined` 와 `[]` 를 반드시 구분한다.
 */
export const getCachedClients = cache(
  async (clientIds?: string[]) => {
    if (clientIds !== undefined && clientIds.length === 0) {
      return [];
    }

    return prisma.client.findMany({
      where: {
        isActive: true,
        ...(clientIds === undefined ? {} : { id: { in: clientIds } }),
      },
      select: {
        id: true,
        code: true,
        name: true,
      },
      orderBy: { name: 'asc' },
    });
  },
  ['clients'],
  { revalidate: 300 } // 5분마다 갱신
);
