# API 500 에러 빠른 해결 가이드

## 🚨 증상
```
GET http://localhost:3000/api/srs 500 (Internal Server Error)
```

## ✅ 해결 방법 (순서대로 시도)

### 방법 1: 개발 서버 재시작 (가장 효과적)

1. **개발 서버 중지**
   - 개발 서버가 실행 중인 터미널에서 `Ctrl + C`

2. **Prisma 클라이언트 재생성**
   ```bash
   npx prisma generate
   ```

3. **개발 서버 재시작**
   ```bash
   pnpm dev
   ```

### 방법 2: 데이터베이스 상태 확인

1. **Prisma Studio 열기**
   ```bash
   npx prisma studio
   ```

2. **브라우저에서 확인**: http://localhost:5555

3. **확인 사항**:
   - `User` 테이블에 사용자 있는지
   - `Client` 테이블에 고객사 있는지
   - `ServiceCategory` 테이블에 카테고리 있는지
   - `SR` 테이블 (비어있어도 OK)

### 방법 3: Seed 데이터 재실행

만약 테이블이 비어있다면:

```bash
npx prisma db seed
```

### 방법 4: 마이그레이션 재실행

```bash
npx prisma migrate dev
```

---

## 🔍 에러 상세 확인 방법

### 브라우저에서

1. **F12** → Developer Tools 열기
2. **Network 탭** 선택
3. **페이지 새로고침** (F5)
4. **`srs` 요청 클릭**
5. **Response 탭** 확인
   - `details` 필드에 에러 메시지가 표시됩니다

### 개발 서버 터미널에서

```
Error fetching SRs: [에러 메시지]
Error details: [상세 정보]
```

이 메시지를 확인하고 알려주세요.

---

## 💡 자주 발생하는 에러들

### 1. Prisma Client 타입 불일치
```
PrismaClientValidationError: Invalid `prisma.sR.findMany()` invocation
```
**해결**: `npx prisma generate` 실행

### 2. 외래키 제약 조건
```
Foreign key constraint failed
```
**해결**: ServiceCategory나 Client 데이터 확인

### 3. 필드명 불일치
```
Unknown field `assignedTo`
```
**해결**: 이미 수정됨 (assignee → assignedTo 매핑 추가)

---

## 🎯 추천 순서

1. ✅ **개발 서버 재시작** (방법 1)
2. ✅ **Prisma Studio로 데이터 확인** (방법 2)
3. ✅ **필요시 Seed 재실행** (방법 3)

---

**작성일**: 2024-11-08

