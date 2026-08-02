# 서버 잔여 작업 런북 (2026-08-01)

감사 3.30 / 3.31 의 **서버 측 잔여 작업**이다. 코드는 모두 반영되어 있고, 아래는
프로덕션 호스트에서 한 번 실행하면 되는 절차다.

- 대상: `opc@134.185.106.129` (`/home/opc/sr`)
- 각 블록은 **멱등**하다. 여러 번 실행해도 안전하다.
- 각 단계 끝에 **확인 명령**이 있다. 출력이 기대와 다르면 다음 단계로 넘어가지 말 것.

---

## 0. 접속

```bash
ssh -i ssh-key-2026-01-18.key opc@134.185.106.129
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

# 복구 리허설이 복호화할 수 있도록 개인키 "경로" 를 알려준다(키 자체가 아니라 경로다)
gh secret set BACKUP_AGE_IDENTITY_FILE --repo lkindo/sr --body '/home/opc/sr/var/backup-age.key'

gh secret list --repo lkindo/sr | grep BACKUP
```

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

## 완료 체크리스트

- [ ] uptime-kuma 에 `sr.lkindo.kr/api/health` 모니터 등록 + 알림 채널 연결
- [ ] uptime-kuma 에 `test.lkindo.kr/api/health` 모니터 등록
- [ ] 서버에 age 설치
- [ ] age 키 생성 + **개인키를 비밀번호 관리자에 백업**
- [ ] `BACKUP_ENCRYPT_RECIPIENT` / `BACKUP_AGE_IDENTITY_FILE` 시크릿 등록
- [ ] 암호화 백업 1회 실행 확인 (`.age` 생성 + 평문 없음)
- [ ] 복구 리허설 통과 확인
- [ ] (배포 후) certbot cron 설치 확인
- [ ] (배포 후) 앱 healthcheck / SHA 태그 / KST 확인
