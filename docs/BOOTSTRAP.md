# 최초 기동 및 관리자 계정 부트스트랩

깨끗한 DB 로 이 시스템을 처음 띄울 때 필요한 절차다.

**왜 별도 절차가 필요한가:** 마이그레이션은 스키마만 만들고 데이터는 넣지 않는다.
`roles` / `permissions` 행이 없으면 앱은 정상 부팅하지만 **아무도 로그인할 수 없고**,
회원가입도 기본 역할(`CLIENT_USER` 또는 `ENGINEER`)을 찾지 못해
"시스템 설정 오류: 기본 역할을 찾을 수 없습니다" 로 실패한다
(`src/app/(auth)/register/actions.ts:71-82`).

---

## 1. 시드가 하는 일

시드는 단일 파일 `prisma/seed.ts` 이며 `pnpm db:seed` (= `tsx prisma/seed.ts`) 로 실행한다.
`main()` 은 항상 아래 순서로 진행한다(`prisma/seed.ts:934-954`).

| 순서 | 단계                                 | 실행 조건                                                                    |
| ---- | ------------------------------------ | ---------------------------------------------------------------------------- |
| 1    | 기준 데이터 `seedReferenceData()`    | 항상. upsert 라 멱등하며 사용자 데이터를 건드리지 않는다                     |
| 2    | 부트스트랩 관리자 `bootstrapAdmin()` | `BOOTSTRAP_ADMIN_EMAIL` 과 `BOOTSTRAP_ADMIN_PASSWORD` 가 **둘 다** 있을 때만 |
| 3    | 개발용 픽스처 `seedDevFixtures()`    | `NODE_ENV !== 'production'` **그리고** `SEED_DEV_FIXTURES=true`              |

2번이 1번 뒤에 오므로 **`db:seed` 를 한 번만 실행해도 역할 생성과 관리자 생성이 함께 끝난다.**
(ADMIN 역할이 있어야 부트스트랩이 동작하는데, 같은 실행의 1단계가 그것을 만든다.)

### 부트스트랩 관리자의 안전장치

`prisma/seed.ts:881-932` 이 보장하는 계약이다. 회귀 테스트는
`src/__tests__/bootstrap-admin.test.ts` 에 있다.

- 두 환경변수 중 하나라도 없으면 **아무것도 하지 않는다.**
- `ADMIN` 역할 보유자가 **한 명이라도 있으면 건너뛴다** — 재실행해도 관리자가 늘지 않는다.
- 비밀번호가 **12자 미만이면 중단한다.**
- 같은 이메일의 사용자가 이미 있으면 **비밀번호를 덮어쓰지 않고 ADMIN 역할만 부여한다** —
  운영자가 바꿔 둔 비밀번호를 되돌리지 않기 위해서다.
- 이름은 `BOOTSTRAP_ADMIN_NAME` 으로 지정할 수 있고, 없으면 `시스템 관리자` 가 된다.

**왜 "최초 가입자 자동 승격" 이 아니라 환경변수 방식인가:** 최초 가입자를 ADMIN 으로 올리면,
인스턴스가 인터넷에 노출된 상태에서 소유자보다 먼저 가입한 사람이 관리자가 되는 경쟁 조건이
생긴다. 환경변수로 명시하면 그 창이 없다(`prisma/seed.ts:865-880` 의 근거 주석).

---

## 2. 로컬 개발

```bash
# 1) compose 보간용 POSTGRES_* 를 준비한다.
#    compose 는 프로젝트 루트 `.env` 에서만 이 값들을 읽는다.
cp .env.example .env

# 2) PostgreSQL 16 컨테이너를 띄운다. 관리형 DB 계정을 만들 필요가 없다.
docker compose up -d db

# 3) 의존성 설치. postinstall 이 `prisma generate` 까지 수행한다.
pnpm install

# 4) 스키마를 적용한다. 마이그레이션은 스키마만 만들고 데이터는 넣지 않는다.
pnpm exec prisma migrate deploy
```

이어서 기준 데이터와 관리자 계정을 **한 번의 실행으로** 만든다(PowerShell 기준).

```powershell
# 5) 12자 이상 비밀번호여야 한다. 짧으면 시드가 부트스트랩을 중단한다.
$env:BOOTSTRAP_ADMIN_EMAIL="admin@example.com"
$env:BOOTSTRAP_ADMIN_PASSWORD="충분히-긴-임시-비밀번호"
pnpm db:seed
```

```bash
# 6) 개발 서버. .env.example 의 NEXTAUTH_URL 은 http://localhost:3000 이다.
pnpm dev
```

> **주의:** 시드는 시작할 때 `dotenv` 를 `config({ override: true })` 로 불러온다
> (`prisma/seed.ts:7-12`). 즉 `.env` 파일에 같은 이름의 값이 있으면 **셸에서 내보낸
> 환경변수를 덮어쓴다.** 위 PowerShell 변수가 무시된다면 `.env` 에 같은 키가
> 들어 있는지 확인한다(`.env.example` 에서는 주석 처리되어 있다).

### 테스트 계정까지 필요할 때

E2E/수동 테스트용 계정(engineer / client / manager / client-admin), 테스트 고객사,
샘플 SR 까지 만들려면 픽스처를 명시적으로 켠다. 프로덕션에서는 어떤 경우에도 실행되지 않는다.

```powershell
$env:SEED_DEV_FIXTURES="true"
$env:SEED_ADMIN_PASSWORD="충분히-긴-임시-비밀번호"
pnpm db:seed
```

`SEED_ADMIN_PASSWORD` 는 픽스처 계정 `admin@example.com` 이 **아직 없을 때만** 쓰인다.
값을 주지 않으면 그 계정 생성만 건너뛴다(`prisma/seed.ts:344-351`).

---

## 3. Docker / 프로덕션

컨테이너에서는 마이그레이션과 시딩이 **기동 시 자동으로** 수행된다.
`docker-entrypoint.sh` 가 앱 프로세스 실행 전에 처리한다.

1. `prisma migrate deploy` — 실패하면 P3005(비어 있지 않은 DB 에 히스토리 없음)로 보고
   `prisma migrate resolve --applied 0_init` 후 재시도한다.
2. `node prisma/seed.bundle.cjs` — 기준 데이터 시딩과 부트스트랩 관리자 생성.
   이 번들은 이미지 빌드 중 esbuild 가 `prisma/seed.ts` 에서 생성한다(`Dockerfile:49-52`).
   시딩이 실패해도 **부팅을 막지는 않는다** — DB 일시 오류로 앱 전체가 뜨지 못하는 쪽이 더 나쁘다.

따라서 운영자가 할 일은 **환경변수를 넣어 주는 것뿐**이다.

`docker-compose.yml` 의 `app` 서비스는 `env_file: .env.docker` 를 읽는다.
이 파일은 `.gitignore:35` 로 추적에서 제외되므로 **저장소에 없고 직접 만들어야 한다.**
`.env.example` 을 출발점으로 삼는다.

```bash
# .env.docker — 최초 1회만 필요한 값
BOOTSTRAP_ADMIN_EMAIL=admin@your-domain.com
BOOTSTRAP_ADMIN_PASSWORD=12자-이상의-긴-임시-비밀번호
BOOTSTRAP_ADMIN_NAME=시스템 관리자
```

```bash
docker compose up --build -d
```

앱 컨테이너는 `3001:3000` 으로 매핑되므로 호스트에서는 `http://localhost:3001` 로 접속한다
(`docker-compose.yml:9-10`).

---

## 4. 부트스트랩 이후 (필수)

1. 생성된 관리자로 로그인한다.
2. 비밀번호를 변경한다.
3. **`BOOTSTRAP_ADMIN_PASSWORD` 를 환경에서 제거하고 재기동한다.**
   멱등 가드 덕분에 남겨 둬도 계정이 다시 만들어지지는 않지만, 평문 자격증명을
   운영 환경에 계속 두는 것 자체가 위험하다.

---

## 5. 시드 로그로 진단하기

부트스트랩이 조용히 넘어갔다면 시드 출력에 이유가 찍혀 있다.

| 로그                                                                          | 의미                                                  |
| ----------------------------------------------------------------------------- | ----------------------------------------------------- |
| (부트스트랩 관련 출력이 아예 없음)                                            | 두 환경변수 중 하나가 비어 있다                       |
| `ADMIN 이 이미 N명 있어 부트스트랩을 건너뜁니다.`                             | 정상. 이미 관리자가 있다                              |
| `BOOTSTRAP_ADMIN_PASSWORD 가 12자 미만이라 부트스트랩을 중단합니다.`          | 비밀번호를 12자 이상으로 늘린다                       |
| `ADMIN 역할이 없어 부트스트랩을 건너뜁니다(기준 데이터 시딩 실패?).`          | 1단계 기준 데이터 시딩이 실패했다. DB 연결을 확인한다 |
| `기존 사용자 ... 에게 ADMIN 역할을 부여했습니다(비밀번호는 유지).`            | 정상. 해당 계정의 기존 비밀번호로 로그인한다          |
| (컨테이너) `WARNING: 기준 데이터 시딩 실패 — 로그인 불가 상태일 수 있습니다.` | 앱은 떴지만 시딩이 실패했다. 컨테이너 로그를 확인한다 |

---

## 관련 문서

- [docs/DB.md](./DB.md) — 시드 구조, 역할별 권한 매핑, 마이그레이션 이력, 로컬 DB 설정
- [.env.example](../.env.example) — 부트스트랩 변수 템플릿(파일 하단)
- [docs/SERVER_RUNBOOK_2026-08-01.md](./SERVER_RUNBOOK_2026-08-01.md) — 서버 운영 런북
