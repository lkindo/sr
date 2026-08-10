# GitHub Secrets 설정 가이드

이 문서는 CI/CD 파이프라인에 필요한 GitHub Secrets 설정 방법을 안내합니다.

## 필수 Secrets

### 데이터베이스 (PostgreSQL)

1. **DATABASE_URL**
   - 설명: Production 데이터베이스 연결 URL
   - 형식: `postgresql://user:password@host:port/database`
   - 확인 방법: 운영 PostgreSQL 서버의 접속 정보(호스트/포트/계정)로 연결 문자열 구성

2. **DIRECT_URL**
   - 설명: Direct 데이터베이스 연결 URL (Prisma)
   - 형식: `postgresql://user:password@host:port/database`
   - 확인 방법: 커넥션 풀러를 거치지 않는 운영 PostgreSQL 직접 연결 문자열 사용

3. **TEST_DATABASE_URL**
   - 설명: 테스트용 데이터베이스 URL
   - 권장: 별도의 테스트 데이터베이스 사용
   - 또는 로컬 PostgreSQL 사용 시: `postgresql://postgres:postgres@localhost:5432/sr_test`

4. **TEST_DIRECT_URL**
   - 설명: 테스트용 Direct URL
   - TEST_DATABASE_URL과 동일하게 설정 가능

### 인증 (NextAuth)

5. **NEXTAUTH_SECRET**
   - 설명: NextAuth JWT 암호화 키
   - 생성 방법: `openssl rand -base64 32`
   - 예시: `your-secret-key-here-32-characters-long`

6. **NEXTAUTH_URL**
   - 설명: 애플리케이션 URL
   - Production: 배포 도메인(예: `https://sr.example.com`)

> **2026-08-10 정리** — `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` 와
> `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` 항목을 삭제했다.
> 이 프로젝트는 자체 호스팅(Docker Compose + nginx)으로 배포하며, 워크플로 7개 어디에서도
> 이 secret 들을 참조하지 않는다(`grep -rn 'VERCEL_\|UPSTASH' .github/workflows/` → 0건).
> 캐시는 `next/cache` 의 `unstable_cache`, 레이트리밋은 앱 인메모리 구현을 쓴다.
> 배포에 실제로 필요한 secret 은 아래 서버 접속 정보(`SERVER_HOST` 등)다.

---

## Secrets 설정 방법

### GitHub Repository에서 설정

1. GitHub 저장소 페이지로 이동
2. **Settings** → **Secrets and variables** → **Actions** 클릭
3. **New repository secret** 클릭
4. Secret 이름과 값을 입력
5. **Add secret** 클릭

### GitHub CLI로 설정 (대량 설정)

```bash
# GitHub CLI 설치 필요: https://cli.github.com

gh secret set DATABASE_URL
# 값 입력 (Enter 후 붙여넣기, Ctrl+D로 완료)

gh secret set DIRECT_URL
gh secret set TEST_DATABASE_URL
gh secret set TEST_DIRECT_URL
gh secret set NEXTAUTH_SECRET
gh secret set NEXTAUTH_URL
```

---

## 환경 변수 vs Secrets

### Secrets에 저장해야 할 것

- 데이터베이스 URL (비밀번호 포함)
- API 키, 토큰
- 암호화 키 (NEXTAUTH_SECRET)
- 민감한 설정 값

### 환경 변수로 저장해도 되는 것

- 공개 URL (NEXT*PUBLIC*\* 변수)
- 기능 플래그
- Node 버전, pnpm 버전

---

## 검증 방법

Secrets가 올바르게 설정되었는지 확인하려면:

1. 저장소에서 Pull Request 생성
2. **Actions** 탭에서 워크플로우 실행 확인
3. 로그에서 "Secret not found" 에러 없는지 확인

또는 워크플로우를 수동으로 실행:

1. **Actions** 탭 → **CI/CD Pipeline** 선택
2. **Run workflow** 클릭
3. 실행 결과 확인

---

## 보안 주의사항

⚠️ **절대 하지 말 것**:

- Secrets를 코드에 하드코딩
- Secrets를 Git에 커밋
- Secrets를 로그에 출력
- Secrets를 공개 Gist나 Pastebin에 업로드

✅ **권장 사항**:

- 각 환경(dev, staging, prod)별로 별도의 Secrets 사용
- 정기적으로 토큰 및 키 교체 (3-6개월)
- 팀원 퇴사 시 관련 Secrets 즉시 교체
- 최소 권한 원칙 적용 (필요한 권한만 부여)

---

## 문제 해결

### "Secret not found" 에러

- Secret 이름 철자 확인
- Secret이 실제로 저장되었는지 Settings에서 확인
- 대소문자 구분 확인

### 데이터베이스 연결 실패

- DATABASE_URL 형식 확인
- 데이터베이스 서버의 IP 허용 목록(방화벽) 확인 (CI/배포 환경에서의 접근 허용 필요)
- SSL 모드 확인 (`?sslmode=require` 추가 필요할 수 있음)

### 배포 실패 (자체 호스팅 Docker 서버)

- `SERVER_HOST` / `SERVER_USER` / SSH 키 secret 이 설정되어 있는지 확인
- 서버에서 `docker compose -f docker-compose.prod.yml config` 가 통과하는지 확인
  (`POSTGRES_USER` 등은 기본값이 없어 비면 즉시 실패한다)
- 배포는 `CI/CD Pipeline` 이 성공한 push 에만 트리거된다 — CI 가 빨간불이면 배포는 아예 돌지 않는다

---

**설정 도움이 필요하면 팀 리더에게 문의하세요.**
