/**
 * React Query 키 팩토리 — 캐시 키의 단일 원천.
 *
 * ── 왜 팩토리인가 ───────────────────────────────────────────────────────────
 * 키를 호출부마다 리터럴로 적으면, 조회하는 쪽과 무효화하는 쪽이 **조용히 어긋난다.**
 * 이 저장소에 이미 그 사고가 있었다: `use-realtime-status.ts` 의 주석이 기록하듯
 * `invalidateQueries({ queryKey: ['srs'] })` 는 **어떤 쿼리와도 매칭되지 않는 무동작**이었고,
 * 그래서 실시간 이벤트가 토스트만 띄우고 목록은 그대로였다. 오타가 아니라 "그 키로 등록된
 * 쿼리가 애초에 없었다" 는 문제이고, 리터럴을 흩어 두면 타입이 잡아 주지 못한다.
 *
 * ── 규칙 ────────────────────────────────────────────────────────────────────
 * `[리소스, id?, 하위리소스?, 파라미터객체?]` — 넓은 키가 좁은 키의 접두사가 되도록 배열을
 * 계층으로 쌓는다. 그래야 `invalidateQueries({ queryKey: qk.clients.all })` 한 번으로
 * 목록·상세·하위 컬렉션이 전부 무효화된다.
 *
 * 파라미터는 **객체 하나로 마지막 요소**에 넣는다. React Query 는 키를 결정적으로
 * 직렬화하므로 객체 안 키 순서는 상관없다.
 *
 * ── ⚠️ SSR 화면과 클라이언트 쿼리를 구분할 것 ───────────────────────────────
 * SR 목록(`/srs`)과 대시보드는 **서버 컴포넌트**다. 캐시에 데이터가 없으므로 무효화해도
 * 아무 일도 일어나지 않고, 갱신은 `router.refresh()` 로만 된다. 반면 아래 `clients`·`users`·
 * `myRequests` 는 클라이언트 쿼리라 무효화가 실제로 동작한다.
 *
 * 이 구분이 중요한 이유: 클라이언트 쿼리가 된 화면에서 `router.refresh()` 와
 * `invalidateQueries` 를 **둘 다** 부르면 같은 데이터를 두 번 가져온다. 화면을 옮길 때
 * 남아 있는 `router.refresh()` 를 함께 걷어낼지 판단해야 한다.
 */

/** 목록 쿼리의 파라미터. `undefined` 는 "그 필터를 걸지 않음" 이다. */
export type ListParams = Record<string, string | number | boolean | undefined | null>;

export const queryKeys = {
  /**
   * SR. `sr` 루트는 기존 훅(use-sr.ts, use-sr-infinite.ts)이 이미 쓰던 관례를 그대로 옮긴 것이다.
   *
   * ⚠️ `list` 는 **서버 컴포넌트가 그리는 화면**이라 등록된 쿼리가 없다. 여기에 두는 이유는
   * 기존 코드가 `['srs']` 를 무효화하고 있어 그 호출부를 찾을 수 있게 하기 위함이며,
   * 실제로는 무동작이다. SR 목록을 클라이언트 쿼리로 옮기기 전에는 `router.refresh()` 를 쓸 것.
   */
  srs: {
    all: ['srs'] as const,
  },
  sr: {
    all: ['sr'] as const,
    detail: (srId: string) => ['sr', srId] as const,
    comments: (srId: string) => ['sr', srId, 'comments'] as const,
    activities: (srId: string) => ['sr', srId, 'activities'] as const,
    attachments: (srId: string) => ['sr', srId, 'attachments'] as const,
    statusHistory: (srId: string) => ['sr', srId, 'status-history'] as const,
  },

  clients: {
    all: ['clients'] as const,
    list: (params: ListParams) => ['clients', 'list', params] as const,
    detail: (clientId: string) => ['clients', clientId] as const,
    /** 고객사에 속한 사용자. 행 확장 지연로딩이 이 키로 조회한다. */
    users: (clientId: string) => ['clients', clientId, 'users'] as const,
    categories: (clientId: string) => ['clients', clientId, 'categories'] as const,
    /** 회원가입 화면이 쓰는 무인증 목록. 인증 목록과 캐시를 섞지 않으려고 분리한다. */
    publicList: ['clients', 'public'] as const,
  },

  users: {
    all: ['users'] as const,
    list: (params: ListParams) => ['users', 'list', params] as const,
    detail: (userId: string) => ['users', userId] as const,
  },

  roles: {
    all: ['roles'] as const,
  },

  permissions: {
    all: ['permissions'] as const,
  },

  serviceCategories: {
    all: ['service-categories'] as const,
  },

  myRequests: {
    all: ['my-requests'] as const,
    list: (params: ListParams) => ['my-requests', 'list', params] as const,
  },

  dashboard: {
    stats: ['dashboard', 'stats'] as const,
  },

  profile: {
    detail: ['profile'] as const,
  },

  settings: {
    system: ['settings', 'system'] as const,
    notifications: ['settings', 'notifications'] as const,
  },
} as const;

/** 짧게 쓰는 별칭. 호출부에서 `qk.clients.list({...})` 로 읽힌다. */
export const qk = queryKeys;
