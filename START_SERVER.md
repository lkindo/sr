# 🚀 개발 서버 시작 가이드

## ✅ Edge Runtime 오류 수정 완료

`src/lib/prisma.ts`에서 `dotenv` 제거하여 Edge Runtime 호환성 문제 해결

---

## 📋 서버 시작 방법

### 방법 1: 포트 3001로 실행 (권장)

`.env` 파일의 `NEXTAUTH_URL`이 3001로 설정되어 있으므로 권장합니다.

**새 PowerShell 터미널**에서:

```powershell
cd "C:\Users\sanle\OneDrive\문서\GitHub\sr"
$env:PORT=3001
pnpm dev
```

또는 **한 줄로**:

```powershell
cd "C:\Users\sanle\OneDrive\문서\GitHub\sr"; $env:PORT=3001; pnpm dev
```

### 방법 2: 기본 포트(3000)로 실행

포트 3000으로 실행하려면 `.env` 파일 수정 필요:

```bash
NEXTAUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

2. 서버 실행:

```powershell
cd "C:\Users\sanle\OneDrive\문서\GitHub\sr"
pnpm dev
```

---

## ✅ 서버 시작 확인

서버가 정상적으로 시작되면 다음과 같은 메시지가 표시됩니다:

```
▲ Next.js 15.0.3
- Local:        http://localhost:3001
- Environments: .env

✓ Starting...
✓ Ready in 3.2s
```

---

## 🌐 브라우저에서 확인

서버가 시작되면 브라우저에서 다음 URL을 열어보세요:

### 메인 페이지

[http://localhost:3001](http://localhost:3001)

### 회원가입

[http://localhost:3001/register](http://localhost:3001/register)

### 로그인

[http://localhost:3001/login](http://localhost:3001/login)

### 대시보드 (로그인 후)

[http://localhost:3001/dashboard](http://localhost:3001/dashboard)

---

## 🔧 문제 해결

### "포트가 이미 사용 중" 오류

```powershell
# 포트 사용 중인 프로세스 확인
netstat -ano | findstr :3001

# Node.js 프로세스 모두 종료
taskkill /F /IM node.exe

# 다시 시작
pnpm dev
```

### Edge Runtime 오류 재발 시

빌드 캐시 삭제:

```powershell
Remove-Item -Path ".next" -Recurse -Force
pnpm dev
```

### 데이터베이스 연결 오류

Prisma Client 재생성:

```powershell
npx prisma generate
pnpm dev
```

---

## 📝 첫 사용자 등록

### 1. 회원가입

[http://localhost:3001/register](http://localhost:3001/register)에서 계정 생성

**필수 정보**:

- 이름
- 이메일
- 비밀번호 (최소 8자)

### 2. 역할 할당

첫 사용자는 역할이 없으므로 **Prisma Studio**에서 수동 할당:

```powershell
# 새 터미널에서
npx prisma studio
```

브라우저가 자동으로 열리면:

1. `users` 테이블 → 생성된 사용자 ID 복사
2. `roles` 테이블 → ADMIN 역할 ID 복사
3. `user_roles` 테이블 → **Add record** 클릭
4. 필드 입력:
   - `userId`: 사용자 ID 붙여넣기
   - `roleId`: ADMIN 역할 ID 붙여넣기
5. **Save 1 change** 클릭

### 3. 로그인

[http://localhost:3001/login](http://localhost:3001/login)에서 로그인

---

## 🎯 다음 단계

로그인 후 사용 가능한 기능:

### 대시보드

- SR 통계 확인
- 최근 활동 확인

### 고객사 관리

- `/clients` - 고객사 목록
- 고객사 생성, 수정, 삭제

### SR 관리

- `/srs` - SR 목록
- SR 생성, 상세 조회
- 댓글 작성
- 첨부파일 업로드
- 상태 변경

### 역할 관리

- `/roles` - 역할 목록
- 역할별 권한 확인
- 권한 추가/제거

---

## 📊 현재 데이터베이스 상태

### Supabase PostgreSQL

- **연결 상태**: ✅ 정상
- **테이블**: 17개
- **역할**: 5개 (ADMIN, MANAGER, ENGINEER, CLIENT_ADMIN, CLIENT_USER)
- **권한**: 31개

### Seed 데이터

- ✅ 역할 및 권한 생성 완료
- ⚠️ 사용자는 회원가입으로 생성 필요

---

## 📚 관련 문서

- **`EDGE_RUNTIME_FIX.md`**: Edge Runtime 오류 수정 내역
- **`SETUP_COMPLETE.md`**: 설정 완료 요약
- **`SUPABASE_SETUP.md`**: Supabase 설정 가이드
- **`DEVELOPMENT_STATUS.md`**: 개발 현황

---

## 🆘 도움말

### 유용한 명령어

```bash
# 개발 서버 실행 (포트 3001)
$env:PORT=3001; pnpm dev

# Prisma Studio (DB GUI)
npx prisma studio

# 린트 검사
pnpm lint

# 타입 체크
pnpm type-check

# 빌드 캐시 삭제
Remove-Item -Path ".next" -Recurse -Force
```

### 로그 확인

개발 서버 실행 중 오류가 발생하면 터미널 출력을 확인하세요:

- ✅ 정상: `Ready in X.Xs`
- ❌ 오류: 빨간색 에러 메시지

---

**작성일**: 2025-11-08  
**상태**: ✅ Edge Runtime 오류 수정 완료  
**다음 단계**: 서버 실행 및 첫 사용자 등록
