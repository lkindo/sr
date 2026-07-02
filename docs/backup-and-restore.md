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

복구는 파괴적이므로 `RESTORE` 입력 확인을 요구한다. 자동화 시 `FORCE=1` 로 생략 가능.

### 복구 리허설(권장)

분기 1회, **별도 테스트 DB/컨테이너**에 최신 백업을 복구해 실제로 열리는지 검증하라.
"백업이 있다"와 "복구된다"는 다르다.

## ⚠️ 오프호스트 복제 (아직 미구성 — 반드시 추가 권장)

현재 백업은 **운영 서버와 같은 디스크**에 저장된다. 실수 삭제/잘못된 마이그레이션/논리적
손상에는 충분하지만 **디스크 물리 장애·VM 소실**에는 무력하다. 오프호스트 복사를 추가하라.

`scripts/backup.sh` 는 `OFFSITE_CMD` 훅을 제공한다. 예(rclone → S3/B2/GCS):

```bash
# 서버에 rclone 구성(remote 이름 'sr-backups') 후:
OFFSITE_CMD='rclone copy /home/opc/sr/backups sr-backups:sr/backups --max-age 25h' \
  bash scripts/backup.sh
```

민감 데이터이므로 오프호스트 대상은 **비공개 + 서버측 암호화**를 사용하고, 전송 전
`gpg`/`age` 로 암호화하는 것을 권장한다.
