# Task: 포트 80 디자인 깨짐(HSTS 비활성화 및 권한 이슈) 해결

## 📋 진행 상태

- [x] **Think**: 문제 원인 분석 (HSTS 헤더에 의한 브라우저 HTTPS 리다이렉션으로 리소스 차단 가능성, Dockerfile 권한 문제 검토)
  - 원인: `next.config.ts`에서 설정된 `Strict-Transport-Security` (HSTS) 헤더로 인해 브라우저가 80포트 접속 후 강제로 443(HTTPS)으로 CSS/JS 등의 자산을 호출하려다 연결 실패(443 미가동)함.
  - 보완점: `Dockerfile`에서 `public/` 및 `prisma/` 복사 시 `chown`이 누락되어 `nextjs` 유저가 정적 이미지 및 파일에 액세스 불가할 가능성 존재.
- [/] **Plan**: 수정 계획 정의 (next.config.ts의 HSTS 제거, Dockerfile의 public 폴더 chown 추가, 빌드 & 배포 트리거)
  1. `next.config.ts`에서 `Strict-Transport-Security` 헤더 제거.
  2. `Dockerfile`의 `public` 및 `prisma` 복사 구문에 `--chown=nextjs:nodejs` 옵션 적용.
  3. Git Commit & Push하여 GitHub Actions 워크플로우 실행 및 서버 배포 진행.
  4. 로컬 curl 및 브라우저 캐시 무효화 후 접속하여 디자인 깨짐 해결 여부 검증.
- [x] **Implement**: 코드 수정 반영
  - `next.config.ts`에서 HSTS(`Strict-Transport-Security`) 헤더 제거 완료.
  - `Dockerfile`에서 정적 자산 및 prisma 디렉토리 소유권(`--chown=nextjs:nodejs`) 보완 완료.
- [/] **Test**: 배포 후 HTTP 연결 및 리소스 로드 검증
  - 코드 Push 후 CI/CD 트리거 대기 및 결과 모니터링 예정.
  - 브라우저 접속 테스트 시 강제 HTTPS 리다이렉션 발생 여부 및 CSS 로드 상태 확인.
- [ ] **Summarize**: 결과 요약 및 보고
