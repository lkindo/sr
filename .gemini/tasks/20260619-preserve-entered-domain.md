# 20260619-preserve-entered-domain.md

## 📋 개요

사용자가 접속한 도메인(`lkindo.kr`, `www.lkindo.kr`, `sr.lkindo.kr`)을 리다이렉트 없이 그대로 유지할 수 있도록 Nginx 및 Next.js 설정을 조정합니다.

## 🛠️ 체크리스트

- [x] Nginx 설정 (`nginx.conf`) 분석 및 리다이렉트 규칙 확인 (Nginx 리다이렉션 없음 검증)
- [x] Next.js Auth 설정 및 환경 변수 (`NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`) 확인 (도메인 고정 원인 확인)
- [x] Next.js Middleware 또는 리다이렉트 로직 분석
- [x] 도메인 다중 지원 또는 와일드카드 도메인 설정 계획 수립
- [x] 구현 계획서 (`implementation_plan.md`) 작성 및 피드백 요청
- [x] 소스 코드 패치 및 CI/CD 워크플로우 배포 권한 거부(denied) 오류 해결
- [x] OCI 서버 적용 및 동적 도메인 정상 유지 최종 검증

## 🔄 진행 상황

- **2026-06-19 21:46**: 태스크 생성 및 접속 도메인 리다이렉트 원인 파악 시작.
- **2026-06-19 23:24**: `deploy.yml` CI/CD 파이프라인의 권한 문제를 완벽히 해결하고 최신 코드를 배포 완료. OCI 서버 내부에서 DNS 우회 curl 테스트를 통해 `lkindo.kr`, `sr.lkindo.kr` 등의 접속 도메인이 강제 리다이렉션 없이 동적으로 안전하게 유지되는 것을 모두 검증 완료.
