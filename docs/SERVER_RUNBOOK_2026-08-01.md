# 서버 잔여 작업 런북 (2026-08-01)

감사 3.30 / 3.31 의 **서버 측 잔여 작업**이다. 코드는 모두 반영되어 있고, 아래는
프로덕션 호스트에서 한 번 실행하면 되는 절차다.

- 대상: `opc@<SERVER_HOST>` (`/home/opc/sr`)
- 실제 호스트 주소와 SSH 키 파일명은 저장소에 적지 않는다 — 배포 시크릿(GitHub Secrets)과
  운영자 로컬에만 둔다. `docs/SECRET_ROTATION.md` 가 쓰는 표기와 같다.
- 각 블록은 **멱등**하다. 여러 번 실행해도 안전하다.
- 각 단계 끝에 **확인 명령**이 있다. 출력이 기대와 다르면 다음 단계로 넘어가지 말 것.

> **문서 상태 (2026-08-15 확인)**
>
> 이 런북은 **아직 열려 있다.** 날짜가 제목에 박혀 있지만 archive 로 보내지 않는 이유는,
> 아래 항목 중 서버에서 실제로 수행됐는지 저장소만 보고는 알 수 없는 것이 있기 때문이다.
>
> | 절 | 저장소에서 확인 가능한 것 | 서버 확인 필요 |
> | --- | --- | --- |
> | 1. uptime-kuma | — | ✅ 모니터 2건 등록 여부 |
> | 2. 백업 암호화 | — | ✅ age 설치·키 생성·시크릿 등록·복구 리허설 |
> | 3. certbot cron | `deploy.yml` 이 매 배포마다 멱등 설치한다(코드 확인됨) | ✅ 첫 배포 후 `crontab -l` 결과 |
> | 4. 배포 하드닝 | 정의는 main 에 반영됨 | ✅ 첫 배포 결과 |
>
> **완료 처리는 운영자가 확인한 뒤에 한다.** 코드가 준비됐다는 것과 서버에 반영됐다는 것은
> 다른 사실이고, 후자를 저장소가 단정하면 그때부터 이 문서는 신뢰할 수 없어진다.

---

## 0. 접속

```bash
ssh -i <SSH_KEY> opc@<SERVER_HOST>
cd /home/opc/sr
```

---

## 1. [3.30] uptime-kuma 에 `/api/health` 등록

앱 헬스체크(컨테이너 내부)와 별개로, **외부에서 사이트가 살아 있는지** 보는 감시다.
uptime-kuma 컨테이너는 이미 구동 중이다.

### 1-1. 현재 상태 확인

```bash
docker ps --filter name=uptime --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'
```

### 1-2. 등록 (웹 UI)

uptime-kuma 는 API 로 모니터를 만들려면 인증 토큰이 필요해서, **웹 UI 로 등록하는 편이
빠르고 확실하다.** 위 명령에서 확인한 포트로 접속한 뒤:

1. **Add New Monitor**
2. Monitor Type: `HTTP(s)`
3. Friendly Name: `SR 운영 (sr.lkindo.kr)`
4. URL: `https://sr.lkindo.kr/api/health`
5. Heartbeat Interval: `60` 초
6. Retries: `2`
7. **Accepted Status Codes: `200-299`**
   → 이게 핵심이다. `/api/health` 는 DB 연결이 끊기면 **503** 을 반환하도록 되어 있으므로,
   기본 설정 그대로 두면 DB 장애를 정확히 잡아낸다.
8. Save

스테이징도 같은 방식으로 하나 더 (`https://test.lkindo.kr/api/health`).

### 1-3. 알림 채널 연결

모니터만 만들고 알림이 없으면 아무도 모른다. **Settings → Notifications** 에서 채널
(이메일/텔레그램 등)을 만들고, 위 모니터의 **Notifications** 에 체크한다.

### 1-4. 확인

```bash
# 엔드포인트가 실제로 200 을 주는지
curl -s -o /dev/null -w '%{http_code}\n' https://sr.lkindo.kr/api/health
```

`200` 이어야 한다. uptime-kuma 대시보드에서 해당 모니터가 초록색인지도 함께 확인한다.

---

## 2. [3.31] 백업 암호화

> **오프사이트 복제는 소유자 결정으로 도입하지 않는다**(2026-08-01).
> 그래도 암호화는 의미가 있다 — 호스트 침해나 디스크 폐기 시 평문 PII(사용자·고객사·SR 본문)
> 유출을 막는다.

### 2-1. age 설치

```bash
# Oracle Linux / RHEL 계열
sudo dnf install -y age || sudo yum install -y age

# 위가 실패하면 정적 바이너리로 설치
# (버전은 https://github.com/FiloSottile/age/releases 에서 최신 확인)
command -v age || {
  curl -fsSL -o /tmp/age.tar.gz \
    https://github.com/FiloSottile/age/releases/download/v1.2.1/age-v1.2.1-linux-amd64.tar.gz
  tar -xzf /tmp/age.tar.gz -C /tmp
  sudo install -m 0755 /tmp/age/age /usr/local/bin/age
  sudo install -m 0755 /tmp/age/age-keygen /usr/local/bin/age-keygen
  rm -rf /tmp/age /tmp/age.tar.gz
}

age --version
```

### 2-2. 키 생성

```bash
mkdir -p /home/opc/sr/var
umask 077
age-keygen -o /home/opc/sr/var/backup-age.key
chmod 600 /home/opc/sr/var/backup-age.key

# 공개키 출력 (age1... 로 시작)
grep 'public key' /home/opc/sr/var/backup-age.key
```

> ### ⚠️ 개인키를 반드시 서버 밖에도 보관할 것
>
> `/home/opc/sr/var/backup-age.key` 파일이 **이 백업들의 유일한 복호화 수단**이다.
> 이걸 잃으면 암호화된 백업은 **영구히 열 수 없다.**
>
> 그리고 지금은 오프사이트 복제를 하지 않기로 했으므로, 디스크가 죽으면
> **백업과 개인키가 함께 사라진다.** 파일 내용을 1password/Bitwarden 같은
> 비밀번호 관리자에 지금 복사해 둘 것. (`cat /home/opc/sr/var/backup-age.key`)

### 2-3. GitHub Secret 등록

로컬 개발 머신에서 (`gh` 인증 필요):

```bash
# 위 2-2 에서 출력된 age1... 공개키를 그대로 넣는다
gh secret set BACKUP_ENCRYPT_RECIPIENT --repo lkindo/sr --body 'age1...'

gh secret list --repo lkindo/sr | grep BACKUP
```

복구 리허설이 쓰는 개인키 **경로**(`BACKUP_AGE_IDENTITY_FILE=/home/opc/sr/var/backup-age.key`)는
시크릿으로 등록하지 않는다. 키가 아니라 경로라 비밀이 아니고, `restore-rehearsal.yml` 이 값을
직접 들고 있다(시크릿으로 두면 로그에서 가려져 진단만 어려워진다). 키 파일을 위 경로에 두기만 하면 된다.

### 2-4. 확인 — 실제로 암호화되는지

```bash
cd /home/opc/sr
BACKUP_ENCRYPT_RECIPIENT="$(grep 'public key' var/backup-age.key | sed 's/.*: //')" \
  bash scripts/backup.sh

ls -la backups/ | tail -5
```

`db_*.dump.age` 가 생기고 **평문 `db_*.dump` 는 없어야** 한다.
(`backup.sh` 는 암호화 후 평문을 삭제한다. 수신자가 설정됐는데 age 가 없으면
평문을 남기지 않고 실패하도록 되어 있다.)

### 2-5. 확인 — 복구가 되는지

암호화한 백업이 **실제로 복구 가능한지**까지 확인해야 의미가 있다.

```bash
BACKUP_AGE_IDENTITY_FILE=/home/opc/sr/var/backup-age.key \
  bash scripts/restore-rehearsal.sh
```

마지막 줄이 `복구 리허설 통과` 여야 한다.
이 스크립트는 **일회용 컨테이너**에 복구하므로 프로덕션 DB 를 건드리지 않는다.

---

## 3. [3.29] certbot 갱신 cron 확인

배포 워크플로가 자동 설치하지만, main 병합 후 첫 배포가 돌아야 반영된다.
배포 후 다음으로 확인한다.

```bash
crontab -l | grep renew-letsencrypt
ls -la /home/opc/sr/scripts/renew-letsencrypt.sh
```

수동으로 한 번 돌려 동작을 확인해도 안전하다
(`certbot renew` 는 만기 30일 전이 아니면 아무것도 하지 않는다):

```bash
bash /home/opc/sr/scripts/renew-letsencrypt.sh
```

`인증서 변경 없음(만기 30일 전이 아님)` 이 나오면 정상이다.

---

## 4. 배포 하드닝 반영 확인 (main 병합 후 첫 배포 시)

이번 변경은 `workflow_run` 워크플로라 **main 에 병합된 정의가 실행**된다.
첫 배포 때 아래를 확인한다.

```bash
# 앱 컨테이너에 헬스체크가 붙었는지
docker inspect -f '{{.State.Health.Status}}' sr-app

# 이미지가 SHA 태그로 떠 있는지 (롤백 지점이 생겼다는 뜻)
docker inspect -f '{{.Config.Image}}' sr-app

# 롤백 지점 기록
cat /home/opc/sr/.previous-image 2>/dev/null

# 타임존이 KST 인지
docker exec sr-app date
```

기대값: 헬스 `healthy`, 이미지가 `ghcr.io/lkindo/sr:<40자리 SHA>`, `date` 가 KST.

---

## 5. 배포와 롤백 (정본)

> 배포·롤백 동작의 **정본은 이 절**이다(실제 동작은 `.github/workflows/deploy.yml`). TRD·LLD·PRD 는
> 요약과 이 절 링크만 둔다 — 네 문서가 각자 복제하다가 서로 어긋난 적이 있다(2026-09-18 정리).

**이미지 태그.** 빌드는 이동 태그(`main` → `latest`, `dev` → `dev`)와 **커밋 SHA 태그**를 함께
GHCR 에 민다. 운영 배포는 `.env.prod` 에 `APP_IMAGE_TAG=<SHA>` 를 덧붙여 SHA 이미지로 뜬다
(`docker-compose.prod.yml` 의 `${APP_IMAGE_TAG:-latest}`).

**공통 전처리.** GitHub Secrets 에서 서버 파일을 매번 새로 쓴다 — 운영 `.env.docker`+`.env.prod`,
스테이징 `.env.docker.test`+`.env.staging`. 레거시 `.env` 는 쓰지 않는다(`docs/SECRET_ROTATION.md` 4절).
시크릿이 비었거나 `docker compose ... config -q` 보간이 실패하면 **컨테이너를 건드리기 전에** 중단한다.

**운영(`main`) 순서**

1. nginx 설정을 일회용 컨테이너에서 `nginx -t` 로 검증한다. 실패하면 중단(현재 서비스 유지).
2. 롤백 지점 기록: 지금 떠 있는 `sr-app` 의 **이미지 ID**(태그가 아니다)를 `.previous-image` 에 남긴다.
3. 배포 전 백업(`scripts/backup.sh`). 실패하면 중단한다.
4. 적용된 마이그레이션 수를 센다(`_prisma_migrations`).
5. `pull` → `up -d --remove-orphans`(nginx·db 는 설정이 바뀐 경우에만 재생성) →
   `up -d --force-recreate --no-deps app`. **`down` 은 하지 않는다** — 앱 컨테이너만 교체한다.
   마이그레이션과 기준 데이터 시딩은 컨테이너 기동 시 `docker-entrypoint.sh` 가 한다(`docs/BOOTSTRAP.md` 3절).
6. 헬스 게이트: `sr-app` 이 240초 안에 `healthy` 가 되기를 기다린다.
7. Let's Encrypt 발급 스크립트 실행, 갱신 cron 멱등 설치(3절), 7일(`until=168h`)이 지난 이미지와 빌드 캐시 정리.

**자동 롤백 (운영만).** 6에서 healthy 가 되지 않으면:

- 이전 이미지 ID 가 있고 **마이그레이션 수가 배포 전과 같을 때만** 그 이미지에 `:rollback` 태그를
  붙이고 `APP_IMAGE_TAG=rollback` 으로 앱을 다시 띄운다.
- 마이그레이션 수가 바뀌었으면 자동 롤백하지 않는다 — 구버전 코드가 새 스키마를 이해하지 못할 수 있다.
  forward-fix 하거나 3번 백업으로 복구한다(`docs/backup-and-restore.md`).
- 어느 경우든 배포 잡은 실패로 끝난다. 다음 배포가 다시 새 이미지로 덮어쓰므로 원인을 먼저 고친다.

**수동 롤백.** 이전 커밋 SHA 이미지로 되돌린다(GHCR 에 있거나 서버에 7일 안쪽으로 남아 있어야 한다).

```bash
cd /home/opc/sr
sed -i '/^APP_IMAGE_TAG=/d' .env.prod && printf '\nAPP_IMAGE_TAG=%s\n' '<이전 커밋 SHA>' >> .env.prod
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --force-recreate --no-deps app
docker inspect -f '{{.State.Health.Status}}' sr-app   # healthy 확인
```

마이그레이션이 이미 적용된 뒤라면 위 명령만으로는 안전하지 않다(자동 롤백이 건너뛴 이유와 같다).
배포 전 백업으로 DB 까지 되돌릴지 먼저 판단한다. 다음 배포는 Secrets 로 `.env.prod` 를 다시 쓰므로
이 수동 변경은 그때 사라진다.

**스테이징(`dev`) 순서.** `pull` → `down --remove-orphans` → 동명 컨테이너 `docker rm -f` →
`up -d --force-recreate` → `sr-app-test` 헬스 게이트(240초, 실패 시 잡 실패). **자동 롤백은 없다.**
스테이징은 `down` 을 하므로 배포 중 짧은 중단이 있다.

---

## 완료 체크리스트

- [ ] uptime-kuma 에 `sr.lkindo.kr/api/health` 모니터 등록 + 알림 채널 연결
- [ ] uptime-kuma 에 `test.lkindo.kr/api/health` 모니터 등록
- [ ] 서버에 age 설치
- [ ] age 키 생성 + **개인키를 비밀번호 관리자에 백업**
- [ ] `BACKUP_ENCRYPT_RECIPIENT` 시크릿 등록 (`BACKUP_AGE_IDENTITY_FILE` 은 시크릿이 아니다 — 2-3)
- [ ] 암호화 백업 1회 실행 확인 (`.age` 생성 + 평문 없음)
- [ ] 복구 리허설 통과 확인
- [ ] (배포 후) certbot cron 설치 확인
- [ ] (배포 후) 앱 healthcheck / SHA 태그 / KST 확인
