# 20260619-preserve-entered-domain.md

## 📋 개요

사용자가 접속한 도메인(`lkindo.kr`, `www.lkindo.kr`, `sr.lkindo.kr`)을 리다이렉트 없이 그대로 유지할 수 있도록 Nginx 및 Next.js 설정을 조정합니다.

## 🛠️ 체크리스트

- [ ] Nginx 설정 (`nginx.conf`) 분석 및 리다이렉트 규칙 확인
- [ ] Next.js Auth 설정 및 환경 변수 (`NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`) 확인
- [ ] Next.js Middleware 또는 리다이렉트 로직 분석
- [ ] 도메인 다중 지원 또는 와일드카드 도메인 설정 계획 수립
- [ ] 구현 계획서 (`implementation_plan.md`) 작성 및 피드백 요청

## 🔄 진행 상황

- **2026-06-19 21:46**: 태스크 생성 및 접속 도메인 리다이렉트 원인 파악 시작.
