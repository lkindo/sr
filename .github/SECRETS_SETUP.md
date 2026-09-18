# GitHub Secrets 설정 가이드

이 문서는 CI/CD 파이프라인에 필요한 GitHub Secrets 설정 방법을 안내합니다.

## 필요한 Secrets

> **2026-09-18 재정리**: 워크플로가 실제로 읽는 시크릿(`grep -ho 'secrets.[A-Z_0-9]*' .github/workflows/*.yml`)
> 기준으로 다시 썼다. 예전 목록의 `TEST_DATABASE_URL`·`TEST_DIRECT_URL` 은 어디에서도 읽지 않아 뺐다 —
> 통합 테스트는 CI 가 띄우는 일회용 Postgres 서비스 컨테이너를 쓴다. 반대로 배포를 막는 `*_B64` 4종과
> 서버 접속 정보, 백업 시크릿이 빠져 있었다. 값의 형식과 발급 절차는 아래 정본 문서를 따른다.

### 배포 (필수 — 없으면 배포가 컨테이너를 건드리기 전에 중단된다)

| Secret                                               | 쓰는 곳                                                                  | 정본                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------- |
| `SERVER_HOST` / `SERVER_USER` / `SERVER_KEY`         | `deploy.yml`·`backup.yml`·`restore-rehearsal.yml` 등 SSH 접속            | —                             |
| `PROD_ENV_DOCKER_B64` / `PROD_COMPOSE_ENV_B64`       | `deploy.yml` (`main`) — 서버 `.env.docker`·`.env.prod` 를 매번 새로 쓴다 | `docs/SECRET_ROTATION.md` 3절 |
| `STAGING_ENV_DOCKER_B64` / `STAGING_COMPOSE_ENV_B64` | `deploy.yml` (`dev`) — 서버 `.env.docker.test`·`.env.staging`            | `docs/SECRET_ROTATION.md` 3절 |

### 빌드 잡

| Secret                                                             | 쓰는 곳                                                   |
| ------------------------------------------------------------------ | --------------------------------------------------------- |
| `DATABASE_URL` / `DIRECT_URL` / `NEXTAUTH_SECRET` / `NEXTAUTH_URL` | `ci-cd.yml` 의 `Build application`(`pnpm build` 환경변수) |

### 선택

| Secret                     | 쓰는 곳                                          | 없으면                                                      |
| -------------------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| `BACKUP_ENCRYPT_RECIPIENT` | `backup.yml` — 백업 암호화 수신자(age 공개키 등) | 평문으로 저장된다 (`docs/backup-and-restore.md`)            |
| `BACKUP_OFFSITE_CMD`       | `backup.yml` — 오프호스트 복제 명령              | 복제하지 않는다                                             |
| `CODECOV_TOKEN`            | `ci-cd.yml` 커버리지 업로드                      | 업로드만 실패하고 CI 는 계속된다(`fail_ci_if_error: false`) |

`BACKUP_AGE_IDENTITY_FILE` 은 시크릿이 아니다 — `restore-rehearsal.yml` 이 경로를 직접 들고 있다.

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

gh secret set SERVER_HOST
# 값 입력 (Enter 후 붙여넣기, Ctrl+D로 완료)

# base64 값은 파일에서 바로 넣는다 (-w0 이 없으면 줄바꿈이 섞여 디코딩이 깨진다)
base64 -w0 .env.docker | gh secret set PROD_ENV_DOCKER_B64
gh secret set DATABASE_URL
gh secret set NEXTAUTH_SECRET
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
- 서버에서 `docker compose --env-file .env.prod -f docker-compose.prod.yml config -q` 가 통과하는지 확인
  (`POSTGRES_USER` 등은 기본값이 없어 비면 즉시 실패한다). `--env-file` 을 빼면 레거시 `.env` 로
  보간되어 실제 배포와 다른 결과가 나온다(`docs/SECRET_ROTATION.md` 4절)
- 배포는 `CI/CD Pipeline` 이 성공한 push 에만 트리거된다 — CI 가 빨간불이면 배포는 아예 돌지 않는다

---

**설정 도움이 필요하면 팀 리더에게 문의하세요.**
