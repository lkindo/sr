# 20260618-database-schema-sync

운영 DB를 OCI로 이전함에 따라, 기존 Supabase DB를 E2E 및 로컬 테스트 전용 DB로 명확히 사용하고 두 DB 간의 스키마를 항상 동기화하기 위한 엔트리포인트 및 검증 파이프라인 변경 조치 완료.

## 📋 진행 상태 체크리스트

- [x] **Think** — 요구사항 분석 및 기존 코드 영향 파악
  - [x] Supabase DB를 테스트 전용 DB로 고정하고, 운영 DB(OCI)와의 정합성을 위한 자동 마이그레이션 배포 방안 정의.
- [x] **Plan** — 구체적 수정/추가 단계 정의
  - [x] OCI Docker 컨테이너 엔트리포인트(`docker-entrypoint.sh`)에 마이그레이션 배포 추가 기획.
  - [x] 로컬 검증 스크립트(`run-verification.ps1`)에 E2E 전 마이그레이션 실행 스텝 기획.
- [x] **Implement** — 코드 작성 및 리팩토링
  - [x] `docker-entrypoint.sh`에 `npx prisma migrate deploy` 구문 추가.
  - [x] `scripts/run-verification.ps1`에 `Test DB Schema Migration` 실행 스텝 추가.
- [x] **Test** — 테스트·빌드 실행으로 검증
  - [x] `run-verification.ps1` 실행 검증 (`Test DB Schema Migration` 스텝 성공 확인).
- [x] **Summarize** — 결과 요약 및 다음 루프 준비
