# INTAKE_UPDATED Enum 값 추가 가이드

## 문제
`SRActivityType` enum에 `INTAKE_UPDATED` 값이 없어서 접수 정보 수정 시 에러가 발생합니다.

## 해결 방법

### 방법 1: Supabase SQL Editor 사용 (권장)

1. Supabase Dashboard 접속
2. 좌측 메뉴에서 **"SQL Editor"** 클릭
3. **"New query"** 버튼 클릭
4. 다음 SQL 실행:

```sql
ALTER TYPE "SRActivityType" ADD VALUE IF NOT EXISTS 'INTAKE_UPDATED';
```

5. **"Run"** 버튼 클릭 또는 `Ctrl + Enter`

### 방법 2: 직접 SQL 실행

데이터베이스에 직접 연결하여 다음 SQL 실행:

```sql
ALTER TYPE "SRActivityType" ADD VALUE IF NOT EXISTS 'INTAKE_UPDATED';
```

**⚠️ 주의**: 
- PostgreSQL에서 enum에 값을 추가하는 것은 트랜잭션 내에서 실행할 수 없습니다.
- 이미 해당 enum 타입을 사용하는 테이블이 있어도 안전하게 추가할 수 있습니다.
- `IF NOT EXISTS`는 PostgreSQL 9.5+에서만 지원됩니다. 지원하지 않는 경우 다음을 사용:

```sql
-- IF NOT EXISTS를 지원하지 않는 경우
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'INTAKE_UPDATED' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'SRActivityType')
    ) THEN
        ALTER TYPE "SRActivityType" ADD VALUE 'INTAKE_UPDATED';
    END IF;
END $$;
```

### 방법 3: Prisma DB Push (권장하지 않음)

⚠️ **주의**: 이 방법은 데이터 손실이 발생할 수 있습니다.

```bash
npx prisma db push
```

## 확인 방법

SQL 실행 후 다음 쿼리로 확인:

```sql
SELECT enumlabel 
FROM pg_enum 
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'SRActivityType')
ORDER BY enumsortorder;
```

`INTAKE_UPDATED`가 목록에 포함되어 있어야 합니다.

## Prisma Client 재생성

SQL 실행 후 Prisma Client를 재생성해야 합니다:

```bash
npx prisma generate
```

**⚠️ 주의**: 개발 서버가 실행 중이면 중지한 후 실행하세요.


