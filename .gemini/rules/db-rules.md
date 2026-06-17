# 🗄️ 기술 규칙: 데이터베이스 (db-rules.md)

본 문서는 데이터베이스(Prisma, PostgreSQL) 레이어와 관련된 기술 헌법 및 베스트 프랙티스이다.

---

## 1. Prisma 스키마 및 마이그레이션 규칙

- **스키마 변경**: `prisma/schema.prisma` 파일의 모델을 수정하거나 추가할 경우, 반드시 로컬에서 `pnpm prisma migrate dev` 또는 `npx prisma migrate dev --name <migration_name>` 명령어를 실행하여 SQL 마이그레이션 파일을 생성해야 한다.
- **마이그레이션 커밋**: 생성된 `prisma/migrations/` 하위의 마이그레이션 폴더 및 SQL 파일은 변경된 Prisma 스키마 파일과 함께 하나의 커밋으로 관리하여 Git에 커밋해야 한다.
- **클라이언트 재생성**: 스키마가 변경되면 애플리케이션 빌드 전에 반드시 `pnpm prisma generate`를 실행하여 `@prisma/client` 타입을 갱신해야 한다.

---

## 2. 데이터 보존 및 삭제 규칙

- **Hard Delete 지양**: 운영 시스템에서 중요한 데이터(예: SR, 고객사 정보, 사용자 계정 등)는 원칙적으로 Hard Delete(실제 데이터베이스 행 삭제)를 적용하지 않는다.
- **논리적 비활성화 및 Soft Delete 적용**:
  - **현재 구현**: 사용자(`User`) 및 고객사(`Client`) 테이블은 삭제 대신 `isActive` Boolean 플래그를 기본 제공하여 비활성화 상태를 관리한다.
  - **신규 테이블 확장 규칙**: 향후 완전한 레코드 단위의 Soft Delete 기능이 신규 추가되어야 할 경우, 해당 테이블에 `deletedAt` DateTime 컬럼을 추가하고 조회 시 `deletedAt: null` 필터링을 기본 적용하도록 설계한다.
- **감사 및 이력 보존**: 담당자 변경 이력이나 상태 변경 이력은 지워지지 않는 별도의 히스토리성 로그 테이블(Prisma 모델인 `SRActivity` 및 `SRStatusHistory` 등)에 추가 기록되어야 한다.

---

## 3. 외래키 및 연쇄 동작 (`onDelete`) 설정

- **연쇄 삭제 주의**: Prisma 모델 정의 시 `onDelete: Cascade`는 신중하게 선택되어야 한다. 최상위 고객사(`Client`)를 삭제했을 때 소속된 수천 개의 SR이 예고 없이 함께 영구 삭제되는 상황을 방지해야 한다.
- **대체 옵션**: 가급적 자식 레코드가 존재하는 경우 부모 삭제를 방지하는 `onDelete: Restrict` 또는 부모 외래키를 null로 만드는 `onDelete: SetNull` 처리를 고려한다.

---

## 4. 쿼리 최적화 및 슬로우 쿼리 모니터링

- **필요한 필드만 Select**: Prisma 사용 시 대용량 텍스트나 첨부파일 바이너리가 포함될 수 있는 필드는 무조건 전체 조회하지 말고, 필요한 필드만 명시적으로 `select`하여 메모리 사용량을 최소화한다.
- **N+1 쿼리 방지**: 관계형 데이터를 가져올 때는 Prisma의 `include`를 활용하여 Join 쿼리로 가져오거나, 대량 데이터의 경우 배치 처리를 적용하여 데이터베이스 왕복 횟수를 최소화한다.
- **슬로우 쿼리 감지**: Prisma Middleware나 Extension을 통해 200ms 이상 소요되는 쿼리는 콘솔 경고 또는 로깅 시스템에 기록되도록 구성한다.
