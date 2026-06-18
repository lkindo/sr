# 20260618-check-oci-settings

OCI 서버에 SSH 연결하여 현재 설정 상태(스왑 메모리, 방화벽, Docker 구성, Nginx 역방향 프록시 등)를 진단하고, 개선이 필요한 사항을 파악하여 보고 및 개선 조치 완료.

## 📋 진행 상태 체크리스트

- [x] **Think** — 요구사항 분석 및 기존 코드 영향 파악
  - [x] 로컬 프로젝트의 배포 스크립트(`deploy-local.ps1`) 및 환경 설정 분석
  - [x] OCI 접속 정보 확보 (IP: `134.185.106.129`, User: `opc`, Key: `ssh-key-2026-01-18.key`)
- [x] **Plan** — 구체적 수정/추가 단계 정의
  - [x] OCI 서버 SSH 접속 테스트 및 진단 명령어 실행
  - [x] CPU/메모리/디스크 사용량, Swap 메모리 활성화 여부 확인
  - [x] Docker 컨테이너 및 compose 설정 확인
  - [x] Nginx 설정 및 방화벽 설정(포트 노출 상황) 분석
  - [x] 진단 결과를 바탕으로 `implementation_plan.md` 작성 및 피드백 요청
- [x] **Implement** — 코드 작성 및 리팩토링 (필요 시 서버 설정 스크립트 수정 등)
  - [x] 로컬 배포 스크립트 수정 (docker-compose.prod.yml 및 https 적용)
  - [x] 로컬 nginx.conf의 client_max_body_size를 100m로 변경
  - [x] OCI 서버 nginx.conf의 client_max_body_size를 100m로 직접 반영
  - [x] OCI 서버 .env.docker에 실제 Gmail SMTP, Web Push VAPID Key 설정 주입
  - [x] OCI 서버 컨테이너 갱신 (Compose down/up)
- [x] **Test** — 테스트·빌드 실행으로 검증
  - [x] Nginx 설정 파일 문법 검사 (`nginx -t` 정상)
  - [x] Next.js 앱 로그 확인 및 부팅 성공 검증
- [x] **Summarize** — 결과 요약 및 다음 루프 준비
