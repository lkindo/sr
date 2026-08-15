# 백업 및 복구 (Backup & Restore)

프로덕션 데이터(Postgres + 첨부파일)를 백업/복구하는 방법.

## 무엇을 백업하나

| 대상         | 위치                                               | 백업 방식                     |
| ------------ | -------------------------------------------------- | ----------------------------- |
| DB (`sr_db`) | `sr-db` 컨테이너 (`sr_db_data` 볼륨)               | `pg_dump -Fc` (custom format) |
| 첨부파일     | `sr-app` 의 `/app/var/uploads` (`sr_uploads` 볼륨) | `tar czf`                     |

백업 파일은 서버의 `BACKUP_DIR`(기본 `/home/opc/sr/backups`)에 타임스탬프로 저장된다:

```
db_20260703_030000.dump
uploads_20260703_030000.tar.gz
```

보존기간(`RETENTION_DAYS`, 기본 14일)이 지난 파일은 자동 삭제된다.

## 자동 스케줄 (권장)

`.github/workflows/backup.yml` 가 매일 03:00 KST 에 서버로 SSH 접속해 `scripts/backup.sh` 를 실행한다.
필요 시 GitHub Actions 의 **Run workflow** 로 수동 실행(보존 일수 입력 가능)할 수 있다.

> 필요 시크릿: `SERVER_HOST`, `SERVER_USER`, `SERVER_KEY` (배포 워크플로와 동일).

### cron 대안 (GitHub 의존 없이)

서버 crontab 에 직접 등록해도 된다:

```cron
# 매일 03:00 서버 로컬 백업
0 3 * * * cd /home/opc/sr && RETENTION_DAYS=14 bash scripts/backup.sh >> /home/opc/sr/backups/backup.log 2>&1
```

## 수동 백업

```bash
cd /home/opc/sr
bash scripts/backup.sh
# 옵션: BACKUP_DIR=/mnt/data/backups RETENTION_DAYS=30 bash scripts/backup.sh
```

## 복구

```bash
cd /home/opc/sr
# DB만 복구
bash scripts/restore.sh backups/db_20260703_030000.dump
# DB + 첨부 함께 복구
bash scripts/restore.sh backups/db_20260703_030000.dump backups/uploads_20260703_030000.tar.gz
# 복구 후 앱 재시작 권장
docker restart sr-app
```

복구는 파괴적이므로 `RESTORE` 입력 확인을 요구한다. 자동화 시 `FORCE=1` 로 생략 가능하다.
실행 전 DB 덤프와 uploads tar를 검증하고, 현재 운영 상태를 한 번 더 백업한 뒤 앱을 내려
쓰기 유입과 DB 연결을 차단한다. DB와 첨부 복구가 모두 끝난 뒤에만 앱을 다시 시작하고
health 상태를 확인한다. 긴급 상황에서 현재 상태 백업을 의도적으로 생략해야 할 때만
`SKIP_PRE_RESTORE_BACKUP=1`을 사용한다.

`backup.sh`는 DB dump뿐 아니라 uploads tar도 실제로 열어 검증한다. uploads 디렉터리가
없거나 tar 생성/검증이 실패하면 부분 파일을 지우고 non-zero로 종료한다.

### 복구 리허설 (자동화됨)

`scripts/restore-rehearsal.sh` 가 **일회용 Postgres 컨테이너**에 최신 백업을 복구하고
스키마·행 수를 단언한다. **프로덕션 DB 는 건드리지 않는다.**

`.github/workflows/restore-rehearsal.yml` 이 매월 1일(KST 04:00) 자동 실행하며,
`workflow_dispatch` 로 수동 실행도 가능하다.

```bash
# 서버에서 수동 실행 (최신 백업 자동 선택)
bash scripts/restore-rehearsal.sh

# 특정 덤프 지정
bash scripts/restore-rehearsal.sh /home/opc/sr/backups/db_20260801_030000.dump
```

`backup.sh` 의 `pg_restore -l` 은 덤프의 **목차만** 읽는다. 목차가 멀쩡해도 전체 복구는
깨질 수 있으므로, "백업이 있다"가 아니라 "복구된다"를 확인하는 것이 이 리허설의 목적이다.

## 백업 암호화

덤프는 사용자·고객사·SR 본문이 담긴 **평문 PII** 다. 오프호스트로 내보내기 전에 반드시
암호화해야 한다.

`BACKUP_ENCRYPT_RECIPIENT` 를 설정하면 `backup.sh` 가 산출물을 암호화하고 평문을 삭제한다.

```bash
# age 공개키 (권장 — 단일 바이너리, 키링 관리 불필요)
BACKUP_ENCRYPT_RECIPIENT='age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p' \
  bash scripts/backup.sh

# 또는 gpg 키 ID/이메일
BACKUP_ENCRYPT_RECIPIENT='backup@example.com' bash scripts/backup.sh
```

**공개키 방식을 쓰는 이유**: 서버에는 암호화 키만 두고 복호화 키(개인키)는 두지 않는다.
서버가 침해되어도 과거 백업을 읽을 수 없다. 대칭키(passphrase)였다면 호스트에 있는 그
값 하나로 모든 백업이 열린다.

수신자가 설정됐는데 `age`/`gpg` 가 없으면 스크립트는 **평문을 남기지 않고 실패한다** —
"암호화하려 했는데 안 됐다"를 성공으로 보고하지 않는다.

> **암호화하면 리허설은?** 호스트에 복호화 키가 없는 것이 정상이므로,
> `restore-rehearsal.sh` 에 `BACKUP_AGE_IDENTITY_FILE`(또는 `BACKUP_GPG_HOME`)을 줘야 한다.
> 주지 않으면 "검증 불가"로 **실패** 처리된다(성공으로 넘기지 않는다).

## 오프호스트 복제 — 현재 **미사용 (수용된 위험)**

> **결정 (2026-08-01, 소유자):** 오프사이트 복제를 도입하지 않고 운영 서버 동일 디스크
> 백업을 유지한다. 아래 절차는 나중에 도입할 때를 위해 남겨 둔다.
>
> **그대로 남는 노출:** 디스크 물리 장애 · VM 삭제 · 랜섬웨어는 DB·첨부파일·전체 백업을
> **한 번에** 파괴한다. 실수 삭제나 잘못된 마이그레이션 같은 논리적 사고는 현재 백업으로
> 복구되지만, 저장 매체 자체를 잃는 경우는 복구 수단이 없다.

현재 백업은 **운영 서버와 같은 디스크**에 저장된다. 실수 삭제/잘못된
마이그레이션/논리적 손상에는 충분하지만 **디스크 물리 장애·VM 소실**에는 무력하다.

`scripts/backup.sh` 의 `OFFSITE_CMD` 훅으로 복사한다. 예(rclone → S3/B2/GCS):

```bash
# 서버에 rclone 구성(remote 이름 'sr-backups') 후:
OFFSITE_CMD='rclone copy /home/opc/sr/backups sr-backups:sr/backups --max-age 25h' \
  bash scripts/backup.sh
```

`.github/workflows/backup.yml` 이 다음 두 시크릿을 서버로 전달한다.

| GitHub Secret              | 용도                                           |
| -------------------------- | ---------------------------------------------- |
| `BACKUP_ENCRYPT_RECIPIENT` | age 공개키 또는 gpg 키 ID. 미설정 시 평문 저장 |
| `BACKUP_OFFSITE_CMD`       | 오프호스트 복제 명령. 미설정 시 복제 안 함     |
| `BACKUP_AGE_IDENTITY_FILE` | (리허설용) 서버상의 age 개인키 파일 경로       |

> **두 시크릿 모두 등록해야 3.31 이 실제로 닫힌다.** 코드 경로는 준비되어 있지만,
> 값이 없으면 백업은 여전히 평문으로 같은 디스크에만 남는다.
