# 리팩토링 평가 및 최적화 제안

## 📊 분야별 평가 점수 (100점 만점)

### 1. 코드 구조 및 아키텍처 ⭐⭐⭐⭐ (85/100)

**강점:**
- ✅ 레이어드 아키텍처 명확히 구분 (Presentation → Application → Service → Repository)
- ✅ Repository 패턴 적용으로 데이터 접근 계층 분리
- ✅ Server Actions와 Route Handlers의 역할 분리
- ✅ Next.js App Router 구조 활용

**개선 필요:**
- ⚠️ 일부 API Route에서 직접 Prisma 사용 (Repository 우회)
- ⚠️ Service 레이어와 Repository 레이어 간 책임 경계 모호한 부분 존재

**최적화 제안:**
```typescript
// ❌ 현재: API Route에서 직접 Prisma 사용
export const GET = async (request: NextRequest) => {
  const sr = await prisma.sR.findUnique({ where: { id } });
  // ...
};

// ✅ 개선: Repository를 통한 접근
export const GET = async (request: NextRequest) => {
  const srRepository = new SRRepository();
  const sr = await srRepository.findDetailsById(id);
  // ...
};
```

---

### 2. 타입 안정성 ⭐⭐⭐ (65/100)

**현황:**
- `any` 타입 사용: **158개 발견** (59개 파일)
- 주요 사용 위치:
  - API Route handlers (`session: any`)
  - Service 메서드 반환 타입
  - 컴포넌트 props
  - FormData 처리

**강점:**
- ✅ Zod 스키마를 통한 런타임 검증
- ✅ Prisma 타입 자동 생성 활용

**개선 필요:**
- 🔴 `any` 타입 과다 사용으로 타입 안정성 저하
- 🔴 FormData 처리 시 타입 캐스팅 과다
- 🔴 Session 타입이 `any`로 정의됨

**최적화 제안:**

1. **Session 타입 정의**
```typescript
// src/types/session.ts
export interface AuthenticatedSession {
  user: {
    id: string;
    email: string;
    name: string;
    roles: string[];
    permissions: string[];
  };
}

// src/lib/auth-wrapper.ts
export function withAuth<T extends NextRequest = NextRequest>(
  handler: (request: T, context: { session: AuthenticatedSession }) => Promise<NextResponse>
) {
  // ...
}
```

2. **FormData 처리 개선**
```typescript
// ❌ 현재
const data = {
  title: formData.get("title") as string,
  description: formData.get("description") as string,
};

// ✅ 개선: 유틸리티 함수 생성
function parseFormData<T>(formData: FormData, schema: z.ZodSchema<T>): T {
  const data = Object.fromEntries(formData.entries());
  return schema.parse(data);
}
```

3. **Service 반환 타입 명시**
```typescript
// ❌ 현재
async createSR(data: SrCreateData, sessionUser: { id: string; email: string }) {
  // ...
  return this.srRepository.findDetailsById(sr.id);
}

// ✅ 개선
async createSR(
  data: SrCreateData, 
  sessionUser: { id: string; email: string }
): Promise<SRWithDetails> {
  // ...
  return this.srRepository.findDetailsById(sr.id);
}
```

---

### 3. 에러 처리 ⭐⭐⭐⭐⭐ (90/100)

**강점:**
- ✅ 커스텀 에러 클래스 체계적 구성
- ✅ `errorToResult` 헬퍼 함수로 일관된 에러 처리
- ✅ `withAuthAndRateLimit` 래퍼로 중앙화된 에러 핸들링
- ✅ HTTP 상태 코드와 에러 코드 매핑 명확

**개선 필요:**
- ⚠️ 일부 Service 메서드에서 일반 `Error` 사용 (커스텀 에러 미사용)
- ⚠️ 에러 로깅이 일관되지 않음

**최적화 제안:**
```typescript
// ❌ 현재
if (!existingSR) {
  throw new Error("SR을 찾을 수 없습니다.");
}

// ✅ 개선
if (!existingSR) {
  throw new NotFoundError("SR", id);
}

// 에러 로깅 통합
export function logError(error: ServiceError, context?: Record<string, any>) {
  if (process.env.NODE_ENV === 'production') {
    // Sentry 등 에러 트래킹 서비스 연동
    console.error('[Error]', {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      context,
    });
  }
}
```

---

### 4. 성능 최적화 ⭐⭐⭐⭐ (80/100)

**강점:**
- ✅ Prisma `select`를 통한 필요한 필드만 조회
- ✅ `Promise.all`을 활용한 병렬 쿼리 실행
- ✅ `_count`를 통한 효율적인 카운트 조회
- ✅ 인덱스 활용 가능한 쿼리 구조

**개선 필요:**
- ⚠️ N+1 쿼리 가능성 (일부 Repository 메서드)
- ⚠️ 대량 데이터 조회 시 페이지네이션 미적용
- ⚠️ 캐싱 전략 부재

**최적화 제안:**

1. **N+1 쿼리 방지**
```typescript
// ❌ 현재: 각 SR마다 별도 쿼리
const srs = await srRepository.findAll();
for (const sr of srs) {
  const comments = await commentRepository.findBySrId(sr.id);
}

// ✅ 개선: 한 번에 조회
const srs = await srRepository.findAll({
  include: {
    comments: true,
    attachments: true,
  }
});
```

2. **캐싱 전략 도입**
```typescript
// src/lib/cache.ts 확장
export class CacheService {
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = 300
  ): Promise<T> {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);
    
    const data = await fetcher();
    await redis.setex(key, ttl, JSON.stringify(data));
    return data;
  }
}

// 사용 예시
const stats = await cacheService.getOrSet(
  'dashboard:stats',
  () => dashboardService.getStats(),
  300 // 5분 캐시
);
```

3. **데이터베이스 인덱스 최적화**
```sql
-- prisma/migrations/add_indexes.sql
CREATE INDEX idx_sr_status ON "SR"(status);
CREATE INDEX idx_sr_client_id ON "SR"("client_id");
CREATE INDEX idx_sr_requester_id ON "SR"("requester_id");
CREATE INDEX idx_sr_assignee_id ON "SR"("assignee_id");
CREATE INDEX idx_sr_created_at ON "SR"("created_at");
```

---

### 5. 코드 중복 제거 ⭐⭐⭐ (70/100)

**발견된 중복:**

1. **FormData 파싱 로직**
   - `src/actions/sr.actions.ts`
   - `src/actions/user.actions.ts`
   - `src/actions/client.actions.ts`

2. **권한 체크 패턴**
   - 여러 API Route에서 반복

3. **에러 응답 생성**
   - 일부 Route에서 직접 `NextResponse.json` 사용

**최적화 제안:**

1. **FormData 파싱 유틸리티**
```typescript
// src/lib/form-data-parser.ts
export function parseFormData<T>(
  formData: FormData,
  schema: z.ZodSchema<T>
): T {
  const data: Record<string, unknown> = {};
  
  for (const [key, value] of formData.entries()) {
    if (value === '') {
      data[key] = undefined;
    } else {
      data[key] = value;
    }
  }
  
  return schema.parse(data);
}
```

2. **권한 체크 데코레이터/미들웨어**
```typescript
// src/lib/permission-middleware.ts
export function requirePermission(permission: string) {
  return async (request: NextRequest, context: { session: AuthenticatedSession }) => {
    const hasPermission = await permissionService.checkPermission(
      context.session.user.id,
      permission
    );
    
    if (!hasPermission) {
      throw new ForbiddenError(`권한이 없습니다: ${permission}`);
    }
  };
}

// 사용 예시
export const POST = withAuthAndRateLimit(
  requirePermission('sr:create')(
    async (request, { session }) => {
      // ...
    }
  )
);
```

---

### 6. 테스트 가능성 ⭐⭐⭐ (75/100)

**강점:**
- ✅ Vitest 설정 완료
- ✅ 테스트 파일 구조 존재 (`__tests__`, `__tests__/mocks`)
- ✅ MSW를 통한 API 모킹 준비

**개선 필요:**
- 🔴 실제 테스트 커버리지 낮음
- 🔴 Service 레이어 테스트 부족
- 🔴 통합 테스트 부재

**최적화 제안:**

1. **의존성 주입 패턴 도입**
```typescript
// ❌ 현재: 직접 인스턴스 생성
export class SRService {
  private srRepository: SRRepository;
  
  constructor() {
    this.srRepository = new SRRepository();
  }
}

// ✅ 개선: 의존성 주입
export class SRService {
  constructor(
    private srRepository: SRRepository = new SRRepository(),
    private activityRepository: SRActivityRepository = new SRActivityRepository()
  ) {}
}

// 테스트에서 모킹 가능
const mockRepository = createMock<SRRepository>();
const service = new SRService(mockRepository);
```

2. **테스트 커버리지 목표 설정**
```json
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
```

---

### 7. 유지보수성 ⭐⭐⭐⭐ (85/100)

**강점:**
- ✅ 명확한 디렉토리 구조
- ✅ 관심사 분리 잘 되어 있음
- ✅ 일관된 네이밍 컨벤션

**개선 필요:**
- ⚠️ 일부 파일이 과도하게 큼 (700+ 라인)
- ⚠️ 매직 넘버/문자열 존재
- ⚠️ 주석 부족 (복잡한 비즈니스 로직)

**최적화 제안:**

1. **상수 추출**
```typescript
// src/lib/constants.ts
export const SR_PRIORITY_MULTIPLIER = {
  CRITICAL: 0.5,
  HIGH: 0.75,
  MEDIUM: 1.0,
  LOW: 1.5,
} as const;

export const SR_STATUS = {
  REQUESTED: 'REQUESTED',
  INTAKE: 'INTAKE',
  IN_PROGRESS: 'IN_PROGRESS',
  // ...
} as const;
```

2. **큰 파일 분할**
```typescript
// ❌ 현재: src/app/(dashboard)/srs/[id]/intake/page.tsx (700+ 라인)
// ✅ 개선: 컴포넌트 분리
// - IntakeForm.tsx
// - IntakeFormFields.tsx
// - IntakeFormValidation.ts
// - useIntakeForm.ts (커스텀 훅)
```

---

### 8. 보안 ⭐⭐⭐⭐ (85/100)

**강점:**
- ✅ NextAuth를 통한 인증
- ✅ Rate Limiting 적용
- ✅ 권한 기반 접근 제어 (RBAC)
- ✅ Zod를 통한 입력 검증

**개선 필요:**
- ⚠️ SQL Injection 방지 (Prisma 사용으로 안전하지만 추가 검증 필요)
- ⚠️ XSS 방지 (React 기본 방어 있지만 추가 검증)
- ⚠️ CSRF 보호 확인 필요

**최적화 제안:**

1. **입력 검증 강화**
```typescript
// src/lib/sanitize.ts
import DOMPurify from 'isomorphic-dompurify';

export function sanitizeHtml(input: string): string {
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  });
}

export function sanitizeInput(input: string): string {
  return input.trim().replace(/[<>]/g, '');
}
```

2. **보안 헤더 설정**
```typescript
// next.config.ts
const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on'
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload'
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block'
  },
  {
    key: 'Referrer-Policy',
    value: 'origin-when-cross-origin'
  }
];
```

---

## 🎯 우선순위별 개선 로드맵

### Phase 1: 즉시 개선 (1-2주)
1. **타입 안정성 개선**
   - `any` 타입 제거 (Session 타입 정의)
   - FormData 파싱 유틸리티 생성
   - Service 반환 타입 명시

2. **에러 처리 통일**
   - 모든 Service 메서드에서 커스텀 에러 사용
   - 에러 로깅 통합

### Phase 2: 단기 개선 (1개월)
3. **코드 중복 제거**
   - FormData 파싱 유틸리티 적용
   - 권한 체크 미들웨어 생성
   - 공통 로직 추출

4. **성능 최적화**
   - N+1 쿼리 제거
   - 캐싱 전략 도입
   - 데이터베이스 인덱스 추가

### Phase 3: 중기 개선 (2-3개월)
5. **테스트 커버리지 향상**
   - 의존성 주입 패턴 도입
   - Service 레이어 테스트 작성
   - 통합 테스트 추가

6. **유지보수성 개선**
   - 큰 파일 분할
   - 상수 추출
   - 문서화 강화

### Phase 4: 장기 개선 (3-6개월)
7. **보안 강화**
   - 입력 검증 강화
   - 보안 헤더 설정
   - 보안 감사 수행

8. **아키텍처 개선**
   - Repository 패턴 일관성 확보
   - 이벤트 기반 아키텍처 고려
   - 마이크로서비스 전환 검토

---

## 📈 예상 효과

### 타입 안정성 개선 후
- **컴파일 타임 에러 감소**: 30-40%
- **런타임 에러 감소**: 20-30%
- **개발 생산성 향상**: 15-25%

### 성능 최적화 후
- **API 응답 시간 개선**: 20-30%
- **데이터베이스 쿼리 수 감소**: 40-50%
- **서버 리소스 사용량 감소**: 15-20%

### 코드 중복 제거 후
- **코드 라인 수 감소**: 10-15%
- **유지보수 시간 단축**: 25-35%
- **버그 발생률 감소**: 20-30%

---

## 🔍 추가 분석 필요 영역

1. **메모리 사용량 분석**
   - 대량 데이터 조회 시 메모리 사용 패턴
   - 캐시 메모리 최적화

2. **네트워크 최적화**
   - API 응답 크기 최적화
   - 압축 전략

3. **모니터링 및 로깅**
   - 구조화된 로깅 도입
   - 성능 메트릭 수집
   - 에러 트래킹 강화

---

## 📝 결론

현재 코드베이스는 **전반적으로 잘 구조화**되어 있으며, 레이어드 아키텍처와 에러 처리가 우수합니다. 

**주요 개선 포인트:**
1. 타입 안정성 (158개 `any` 타입 제거)
2. 코드 중복 제거
3. 성능 최적화 (N+1 쿼리, 캐싱)
4. 테스트 커버리지 향상

**예상 개선 기간:** 3-6개월
**예상 개발 리소스:** 1-2명 × 3-6개월


