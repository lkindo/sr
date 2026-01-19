# GitHub Secrets 설정 가이드

이 문서는 CI/CD 파이프라인에 필요한 GitHub Secrets 설정 방법을 안내합니다.

## 필수 Secrets

### 데이터베이스 (Supabase)

1. **DATABASE_URL**
   - 설명: Production 데이터베이스 연결 URL
   - 형식: `postgresql://user:password@host:port/database`
   - 경로: Supabase Dashboard → Settings → Database → Connection String

2. **DIRECT_URL**
   - 설명: Direct 데이터베이스 연결 URL (Prisma)
   - 형식: `postgresql://user:password@host:port/database`
   - 경로: Supabase Dashboard → Settings → Database → Direct URL

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
   - Production: `https://your-domain.vercel.app`
   - Preview: 자동으로 Vercel에서 설정

### Vercel 배포

7. **VERCEL_TOKEN**
   - 설명: Vercel 배포를 위한 토큰
   - 생성 경로: Vercel Dashboard → Settings → Tokens
   - 권한: "Full Access" 또는 "Deploy" 권한 필요

8. **VERCEL_ORG_ID**
   - 설명: Vercel 조직 ID
   - 확인 방법: Vercel Dashboard → Settings → General
   - 또는 `.vercel/project.json` 파일에서 확인

9. **VERCEL_PROJECT_ID**
   - 설명: Vercel 프로젝트 ID
   - 확인 방법: Vercel Dashboard → Project Settings
   - 또는 `.vercel/project.json` 파일에서 확인

### 선택사항 (권장)

10. **UPSTASH_REDIS_REST_URL**
    - 설명: Redis 캐시 URL
    - Upstash Dashboard에서 확인

11. **UPSTASH_REDIS_REST_TOKEN**
    - 설명: Redis 인증 토큰
    - Upstash Dashboard에서 확인

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
gh secret set VERCEL_TOKEN
gh secret set VERCEL_ORG_ID
gh secret set VERCEL_PROJECT_ID
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
- Supabase에서 IP 허용 목록 확인 (0.0.0.0/0 허용 필요)
- SSL 모드 확인 (`?sslmode=require` 추가 필요할 수 있음)

### Vercel 배포 실패

- VERCEL_TOKEN이 유효한지 확인
- Token 권한이 충분한지 확인
- VERCEL_ORG_ID와 VERCEL_PROJECT_ID가 정확한지 확인

---

**설정 도움이 필요하면 팀 리더에게 문의하세요.**
