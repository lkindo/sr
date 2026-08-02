# 시크릿 로테이션 런북 (감사 3.1 / 3.13)

> 이 문서는 **사람이 손으로 실행**하는 절차다. 자동화 에이전트가 대신 수행해서는 안 되는
> 단계(실제 시크릿 발급, 이력 재작성, force-push, GitHub Secrets 등록)를 모두 포함한다.
> 저장소 쪽 준비(`.gitignore` / `.dockerignore` / `.gitleaks.toml` / compose 파라미터화)는
> 이미 반영되어 있으므로, 아래 절차만 순서대로 수행하면 된다.

---

## 0. 왜 지금 해야 하는가

- `.env.docker:9-10`, `.env.docker.test:6-7` 에 `NEXTAUTH_SECRET` / `AUTH_SECRET` 이 평문으로
  들어 있고, 두 파일 모두 git 에 **추적되어 있었다**(현재는 추적 해제됨 — 6절).
  다만 **이력에는 그대로 남아 있으므로**(7절) 값 자체는 폐기 대상이다.
- 인증 전략이 JWT(`src/auth.config.ts`)라 서버 측 세션 레코드가 없다. 서명키를 아는 사람은
  **임의의 사용자 ID·역할·테넌트를 담은 세션 쿠키를 직접 만들 수 있다.** 비밀번호 변경으로는
  막을 수 없다.
- 운영과 스테이징의 서명키가 **완전히 동일**하다. 그래서 스테이징(`test.lkindo.kr`)에서 로그인해
  받은 쿠키가 **운영(`sr.lkindo.kr`)에서도 그대로 유효**하다. 환경별로 다른 값을 발급하는 것이
  이 로테이션의 핵심 목표 중 하나다.
- DB 자격증명(`lkind` / `sr1234`)이 `docker-compose.prod.yml`, `docker-compose.test.yml`,
  `.env.docker*` 에 중복 하드코딩되어 있어 커밋 없이는 교체가 불가능했다.

### 폐기(burned) 처리해야 하는 값

| 값                                           | 현재 위치                                                  | 조치                                                                          |
| -------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `NEXTAUTH_SECRET`                            | `.env.docker`, `.env.docker.test`                          | 환경별로 **각각 새로 발급**                                                   |
| `AUTH_SECRET`                                | 동일                                                       | 환경별로 **각각 새로 발급** (같은 환경 내에서는 `NEXTAUTH_SECRET` 과 동일 값) |
| `POSTGRES_PASSWORD` (`sr1234`)               | compose 3종, `.env.docker*` 의 `DATABASE_URL`/`DIRECT_URL` | 환경별로 **각각 새로 발급**                                                   |
| `POSTGRES_USER` (`lkind`)                    | 동일                                                       | 유지해도 되지만 파라미터화되었으므로 이번에 환경별로 분리 권장                |
| `EMAIL_SERVER_PASSWORD`, `VAPID_PRIVATE_KEY` | `.env.docker*` (현재 플레이스홀더)                         | 실제 값을 넣은 적이 있다면 함께 로테이션                                      |
| `ssh-key-2026-01-18.key` (저장소 루트)       | 추적되지 않았으나 `COPY . .` 로 빌드 레이어 유입           | `~/.ssh` 로 이동 + 키 재발급 (별건, 함께 처리 권장)                           |

---

## 1. 사전 준비

1. 점검 공지: **모든 사용자가 재로그인해야 한다.** 서명키가 바뀌면 기존 세션 쿠키는 전부 무효다.
2. DB 백업을 먼저 뜬다(비밀번호 교체 실패 시 복구 경로).

   ```bash
   ssh opc@<SERVER_HOST>
   cd /home/opc/sr
   # backup.sh 는 POSTGRES_USER/POSTGRES_PASSWORD 를 환경에서 읽는다(기본값 lkind).
   set -a; . ./.env 2>/dev/null; set +a
   ./scripts/backup.sh
   ```

3. 현재 운영 `.env.docker` 사본을 안전한 곳(패스워드 매니저)에 보관한다. 이 파일은 저장소에
   배포되지 않고 VM 에만 손으로 편집되어 존재한다.

---

## 2. 새 값 생성

**환경마다 별도로 실행한다. 절대 값을 복사해 재사용하지 않는다.**

```bash
# 세션 서명키 (base64 32바이트) — 운영용
openssl rand -base64 32
# 세션 서명키 — 스테이징용 (위와 반드시 다른 값)
openssl rand -base64 32
# 로컬 개발용 (선택)
openssl rand -base64 32
```

DB 비밀번호는 `DATABASE_URL` 에 그대로 들어가므로 **hex 를 쓴다.**
`openssl rand -base64 32` 의 `/`, `+`, `=` 는 URL 에서 퍼센트 인코딩이 필요해 사고가 잦다.

```bash
# DB 비밀번호 — 운영용
openssl rand -hex 24
# DB 비밀번호 — 스테이징용 (위와 반드시 다른 값)
openssl rand -hex 24
```

> base64 값을 굳이 DB 비밀번호로 쓰겠다면 `DATABASE_URL` 안에서
> `/` → `%2F`, `+` → `%2B`, `=` → `%3D` 로 인코딩해야 한다.

---

## 3. GitHub Actions Secrets 등록

Repository → Settings → Secrets and variables → Actions → **New repository secret**.

파일 전체를 base64 로 넣는 방식을 권장한다. 개별 변수로 쪼개면 `.env.docker` 에 항목이
추가될 때마다 워크플로를 고쳐야 하고, 누락 시 `instrumentation.ts` 의 fail-fast 로
컨테이너가 크래시 루프에 빠진다.

| Secret 이름               | 내용                                                                          |
| ------------------------- | ----------------------------------------------------------------------------- |
| `PROD_ENV_DOCKER_B64`     | 새 운영 `.env.docker` 전체를 base64 인코딩한 문자열                           |
| `STAGING_ENV_DOCKER_B64`  | 새 스테이징 `.env.docker.test` 전체를 base64 인코딩한 문자열                  |
| `PROD_COMPOSE_ENV_B64`    | 운영 compose 보간용 `.env`(`POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB`) |
| `STAGING_COMPOSE_ENV_B64` | 스테이징 compose 보간용 `.env.staging`                                        |

인코딩 방법:

```bash
# Linux / macOS / Git Bash
base64 -w0 .env.docker            # -w0 이 없으면 줄바꿈이 섞여 디코딩이 깨진다
```

```powershell
# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('.env.docker'))
```

`PROD_COMPOSE_ENV_B64` 의 원본 내용 예시(값은 2단계에서 생성한 것으로 대체):

```dotenv
POSTGRES_USER=sr_prod
POSTGRES_PASSWORD=<openssl rand -hex 24 결과>
POSTGRES_DB=sr_db
```

> `POSTGRES_DB` 는 기존 볼륨(`sr_db_data`)에 이미 만들어진 이름과 **반드시 일치**해야 한다.
> 운영은 `sr_db`, 스테이징은 `sr_db_test` 다.

---

## 4. deploy.yml — 이미 반영 완료 (확인만 하면 됨)

> 이 절의 워크플로 변경은 **코드에 이미 반영되어 있다.** 손으로 고칠 것은 없고,
> 3절의 Secrets 4개만 등록하면 된다. 아래는 무엇이 어떻게 동작하는지에 대한 설명이다.

반영된 내용:

1. `Copy Config Files to Remote VM` 의 `source:` 에서 `.env.docker.test` 가 제거되었다.
   추적 해제 후에는 체크아웃에 존재하지 않으므로 scp 대상이 될 수 없다.

2. `Deploy to Remote VM via SSH` 가 브랜치에 따라 시크릿을 골라 서버에 직접 기록한다.
   `main` → `.env.docker` + `.env`, `dev` → `.env.docker.test` + `.env.staging`.
   `umask 077` 로 생성하고 `chmod 600` 을 건다.

3. **보간용 env 파일 분리.** `docker compose` 는 프로젝트 디렉터리의 `.env` 하나만 기본으로
   읽는다. 운영과 스테이징이 같은 `/home/opc/sr` 를 공유하므로, 스테이징은 `--env-file` 로
   `.env.staging` 을 명시해 운영 DB 자격증명이 새어 들어가지 않게 한다. 워크플로는 분기 시점에
   `COMPOSE_ARGS` 를 확정하고 `pull` / `down` / `up` / `image prune` 전부에 동일하게 사용한다.

   ```bash
   COMPOSE_ARGS="--env-file .env.staging -p sr-test -f docker-compose.test.yml"   # dev
   COMPOSE_ARGS="--env-file .env -f docker-compose.prod.yml"                      # main
   ```

   `--env-file` 은 **최상위 플래그**라 하위 명령 앞에 와야 한다.

4. **teardown 이전 2단 안전장치.** 과거 구조에서는 자격증명이 없으면 `down` 이 먼저 실행된 뒤
   `up` 이 보간 실패로 죽어 **서비스가 내려간 채로 멈출** 수 있었다. 이를 막기 위해:
   - 시크릿이 비어 있으면 컨테이너를 건드리기 전에 안내 메시지와 함께 `exit 1`,
   - 이어서 `docker compose $COMPOSE_ARGS config -q` 로 보간을 미리 검증하고 실패 시 `exit 1`.

   두 검사 모두 `down` 보다 앞에 있으므로, 실패해도 **현재 서비스는 계속 살아 있다.**

5. `env_file: .env.docker` 는 **컨테이너 환경변수**일 뿐 compose 보간에는 쓰이지 않는다.
   `${POSTGRES_PASSWORD:?...}` 는 `.env`(또는 `--env-file` 로 지정한 파일)에서만 읽힌다.
   이 둘을 혼동해 보간용 파일을 만들지 않으면 4번의 `config -q` 가 다음 메시지로 배포를
   중단시킨다(의도된 동작).

   ```
   error while interpolating services.db.environment.[]: required variable POSTGRES_PASSWORD is missing a value: POSTGRES_PASSWORD is required
   ```

> `workflow_run` 워크플로는 **기본 브랜치(main)에 있는 정의**가 실행된다. 따라서 이 변경이
> 실제 배포에 적용되려면 `main` 에 병합되어야 한다. `dev` 에만 있는 동안에는 여전히 구버전
> 정의가 돌므로, Secrets 등록 → main 병합 순서를 지킨다.

---

## 5. DB 비밀번호 실제 교체

`POSTGRES_PASSWORD` 환경변수는 **데이터 디렉터리가 비어 있는 최초 기동에만** 반영된다.
이미 초기화된 `sr_db_data` 볼륨에는 아무 효과가 없다. 둘 중 하나를 택한다.

### 방법 A — `ALTER USER` (권장, 데이터 보존)

```bash
ssh opc@<SERVER_HOST>
cd /home/opc/sr

# 1) 현재 비밀번호로 접속해 변경한다.
docker exec -it sr-db psql -U lkind -d sr_db \
  -c "ALTER USER lkind WITH PASSWORD '<새 비밀번호>';"

# 사용자 이름까지 바꾸는 경우
docker exec -it sr-db psql -U lkind -d sr_db \
  -c "ALTER USER lkind RENAME TO sr_prod;" \
  -c "ALTER USER sr_prod WITH PASSWORD '<새 비밀번호>';"
```

> `ALTER USER ... RENAME TO` 는 해당 롤의 MD5 비밀번호를 무효화하므로 **반드시 이름 변경 후
> 비밀번호를 다시 설정**한다. 위 순서를 지킬 것.
> 비밀번호에 `'` 가 들어가지 않도록 hex 생성값을 쓴다.

그다음 `.env`(compose 보간)와 `.env.docker`(`DATABASE_URL`/`DIRECT_URL`)를 새 값으로 갱신하고
재기동한다.

```bash
docker compose -f docker-compose.prod.yml up -d --force-recreate
```

### 방법 B — 볼륨 재생성 (데이터 소실, 스테이징에만 권장)

```bash
# 백업 확인 후에만!
docker compose -p sr-test --env-file .env.staging -f docker-compose.test.yml down -v
docker compose -p sr-test --env-file .env.staging -f docker-compose.test.yml up -d
docker compose -p sr-test exec -T app-test npx tsx prisma/seed.ts
```

---

## 6. 저장소에서 추적 해제 — 이미 반영 완료 (커밋만 남음)

`git rm --cached` 는 **이미 실행되어 인덱스에서 제거된 상태**다. 작업 트리의 파일은 그대로
남아 있어 로컬 개발은 계속 동작한다. 남은 것은 커밋뿐이다.

```bash
git status --short          # .env.docker* 가 D(staged) 로 보이면 정상
git commit -m "chore(security): untrack .env.docker* (secrets moved to GitHub Actions Secrets)"
```

확인:

```bash
git ls-files | grep -i env       # .env.example 만 남아야 한다
git check-ignore -v .env.docker .env.docker.test   # .gitignore:30 규칙에 걸려야 한다
```

> 추적 해제만으로는 **이력에 남은 값이 지워지지 않는다.** 7절의 퍼지까지 마쳐야 하며,
> 퍼지를 하더라도 이미 유출된 값은 폐기된 것으로 간주하고 2절의 재발급을 반드시 수행한다.

---

## 7. 이력(history) 삭제

> ### ⚠️ 경고 — 반드시 먼저 읽을 것
>
> - 아래 작업은 **git 이력을 재작성**한다. 모든 커밋 SHA 가 바뀐다.
> - `--force` push 가 필요하며, 이후 **모든 협업자는 기존 클론을 버리고 재클론**해야 한다.
>   (오래된 클론에서 push 하면 삭제한 커밋이 그대로 되살아난다.)
> - 진행 중인 PR·브랜치는 재작성 전에 머지하거나, 재작성 후 다시 만들어야 한다.
> - **이력 삭제는 로테이션의 대체재가 아니다.** GitHub 에는 이미 캐시·포크·PR 참조가 남을 수
>   있고, 클론한 사람의 로컬 사본은 회수할 수 없다. **2~5단계 로테이션을 먼저 끝낸 뒤**
>   부수적으로 수행한다.
> - 시작 전 전체 저장소를 미러 백업한다: `git clone --mirror <url> sr-backup.git`

### 방법 1 — git-filter-repo (권장)

```bash
pip install git-filter-repo         # 또는 brew install git-filter-repo

# 원본과 분리된 신선한 클론에서 작업해야 한다(filter-repo 요구사항).
git clone --no-local <저장소 경로 또는 URL> sr-purge
cd sr-purge

git filter-repo --invert-paths \
  --path .env.docker \
  --path .env.docker.test

# filter-repo 는 안전을 위해 origin 을 제거한다. 다시 등록 후 강제 푸시.
git remote add origin <원격 URL>
git push --force --all origin
git push --force --tags origin
```

특정 문자열만 지우고 싶다면(파일은 남기는 경우):

```bash
# replacements.txt — 아래 자리표시자를 실제 유출값으로 채워서 로컬에만 두고,
# 이 파일 자체는 절대 커밋하지 않는다(작업 후 삭제).
#   <유출된 기존 NEXTAUTH_SECRET/AUTH_SECRET 값>==>***REMOVED***
#   <유출된 기존 POSTGRES_PASSWORD 값>==>***REMOVED***
git filter-repo --replace-text replacements.txt
```

> 유출된 값을 이 문서에 그대로 적지 말 것. 방법 1의 `--path` 퍼지는 `docs/`를 건드리지
> 않으므로, 여기에 값을 적으면 퍼지 후에도 HEAD에 그대로 남는다.

### 방법 2 — BFG Repo-Cleaner (대안)

```bash
git clone --mirror <원격 URL> sr.git
java -jar bfg.jar --delete-files '.env.docker' sr.git
java -jar bfg.jar --delete-files '.env.docker.test' sr.git
cd sr.git
git reflog expire --expire=now --all && git gc --prune=now --aggressive
git push --force
```

### 재작성 후 협업자 안내(그대로 전달)

```
저장소 이력이 재작성되었습니다. 기존 클론에서 pull/push 하지 마세요.
1. 로컬에 커밋하지 않은 작업이 있으면 패치로 저장: git diff > my.patch
2. 폴더를 지우고 재클론: git clone <URL>
3. 패치 재적용: git apply my.patch
```

---

## 8. 실행 순서 요약

1. 백업 (DB + 현재 `.env.docker` 사본)
2. 새 값 생성 — **운영/스테이징/로컬 각각 다른 값** (2단계)
3. GitHub Actions Secrets 등록 (3단계)
4. `deploy.yml` 수정 후 커밋 (4단계) — 아직 push 하지 않는다
5. 서버에서 DB 비밀번호 교체 (5단계 방법 A) + `/home/opc/sr/.env`, `.env.docker` 갱신
6. `docker compose -f docker-compose.prod.yml up -d --force-recreate` 로 수동 검증
7. `git rm --cached` 커밋 (6단계) → push → 배포 파이프라인 정상 동작 확인
8. 안정화 후 이력 재작성 (7단계) + 협업자 재클론 공지

> 5번을 4번보다 먼저 하면 다음 배포가 옛 비밀번호로 올라와 앱이 DB 연결에 실패한다.
> 7번을 5번보다 먼저 하면 서버에 `.env.docker` 가 없는 상태로 배포가 돌아 크래시 루프가 된다.

---

## 9. 사후 체크리스트

- [ ] 운영과 스테이징의 `NEXTAUTH_SECRET`/`AUTH_SECRET` 이 **서로 다른 값**이다.
- [ ] 운영과 스테이징의 `POSTGRES_PASSWORD` 가 **서로 다른 값**이다.
- [ ] 모든 기존 세션이 무효화되었다 → 전 사용자 재로그인 필요. 공지 발송 완료.
- [ ] **교차 환경 검증**: `test.lkindo.kr` 로그인 후 획득한 세션 쿠키를 `sr.lkindo.kr` 에
      붙여 넣었을 때 로그인 페이지로 리다이렉트되는지 확인한다(이전에는 통과했다).
- [ ] `git ls-files | grep -i env` 결과가 `.env.example` 과 소스 파일만 포함한다.
- [ ] `gitleaks detect --source . --config .gitleaks.toml --redact` 가 clean 이다.
      (이력 재작성 전이라면 과거 커밋에서 여전히 검출된다 — 정상.)
- [ ] `gitleaks dir . --no-git --config .gitleaks.toml --redact` 로 작업 트리도 확인한다.
- [ ] `docker compose -f docker-compose.prod.yml config` 가 `POSTGRES_PASSWORD` 없이
      **실패**하는지 확인한다(fail-fast 가 살아 있다는 증거).
- [ ] 백업/복구 스크립트가 새 자격증명으로 동작한다:
      `set -a; . ./.env; set +a; ./scripts/backup.sh`
- [ ] GitHub Actions 캐시 삭제: `cache-to: type=gha,mode=max` 로 옛 `.env.docker` 가 담긴
      빌드 레이어가 캐시에 남아 있다. Actions → Caches 에서 전부 삭제한다.
      (`.dockerignore` 에 `.env.docker*` 가 추가되어 이후 빌드부터는 유입되지 않는다.)
- [ ] GHCR 에 푸시된 기존 이미지 태그(`latest`, `dev`)의 중간 레이어 점검 — 최종 런타임
      이미지는 standalone 산출물만 복사하므로 깨끗하지만, 빌더 캐시 이미지가 있다면 삭제.
- [ ] 저장소 루트 `ssh-key-2026-01-18.key` 를 `~/.ssh` 로 이동하고 키를 재발급했다.

---

## 10. 이 커밋에서 처리되지 않은 후속 작업

- **`docker-compose.test.yml:35-37`** 이 여전히 `POSTGRES_USER=lkind` /
  `POSTGRES_PASSWORD=sr1234` / `POSTGRES_DB=sr_db_test` 를 리터럴로 갖고 있다.
  `docker-compose.prod.yml` 과 동일하게 `${POSTGRES_USER:?...}` 형태로 바꾸고,
  healthcheck 도 `pg_isready -U "$${POSTGRES_USER}" -d "$${POSTGRES_DB}"` 로 교체해야
  4단계의 `--env-file .env.staging` 분리가 실제로 효과를 낸다.
- **`.github/workflows/deploy.yml`** 수정(4단계)은 이 문서의 지시대로 손으로 적용한다.
- **CI 에 gitleaks 게이트 연결.** `.gitleaks.toml` 은 존재하지만 어떤 워크플로도 실행하지
  않는다. `ci-cd.yml` 에 스텝을 추가해야 재발이 차단된다.

  ```yaml
  - name: Scan for secrets
    uses: gitleaks/gitleaks-action@v2
    env:
      GITLEAKS_CONFIG: .gitleaks.toml
  ```

- **`src/lib/env-validation.ts`** 에 `AUTH_SECRET` / VAPID / EMAIL 변수가 선언되어 있지 않아
  플레이스홀더(`your_..._here`)가 유효한 설정으로 통과한다(감사 별건).
