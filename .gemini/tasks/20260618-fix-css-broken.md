# Task: 포트 80 디자인 깨짐(HSTS 비활성화 및 권한 이슈) 해결

## 📋 진행 상태

- [x] **Think**: 문제 원인 분석 (HSTS 헤더에 의한 브라우저 HTTPS 리다이렉션으로 리소스 차단 가능성, Dockerfile 권한 문제 검토)
  - 원인: `next.config.ts`에서 설정된 `Strict-Transport-Security` (HSTS) 헤더로 인해 브라우저가 80포트 접속 후 강제로 443(HTTPS)으로 CSS/JS 등의 자산을 호출하려다 연결 실패(443 미가동)함.
  - 보완점: `Dockerfile`에서 `public/` 및 `prisma/` 복사 시 `chown`이 누락되어 `nextjs` 유저가 정적 이미지 및 파일에 액세스 불가할 가능성 존재.
- [/] **Plan**: 수정 계획 정의 (next.config.ts의 HSTS 제거, Dockerfile의 public 폴더 chown 추가, 빌드 & 배포 트리거)
  1. `next.config.ts`에서 `Strict-Transport-Security` 헤더 제거. (완료)
  2. `Dockerfile`의 `public` 및 `prisma` 복사 구문에 `--chown=nextjs:nodejs` 옵션 적용. (완료)
  3. `docker-compose.prod.yml`에 사용자 정의 네트워크를 선언하고 MTU 값을 1400으로 하향 조정. (완료)
  4. Git Commit & Push하여 GitHub Actions 워크플로우 실행 및 서버 배포 진행.
  5. 로컬 curl 및 브라우저 캐시 무효화 후 접속하여 디자인 깨짐 해결 여부 검증.
- [x] **Implement**: 코드 수정 반영
  - `next.config.ts`에서 HSTS(`Strict-Transport-Security`) 헤더 제거 완료.
  - `Dockerfile`에서 정적 자산 및 prisma 디렉토리 소유권(`--chown=nextjs:nodejs`) 보완 완료.
  - `docker-compose.prod.yml` 및 `.github/workflows/deploy.yml`에 MTU 1400 사용자 정의 브리지 네트워크 선언 및 롤링 리스타트 흐름 수정 완료.
- [/] **Test**: 배포 후 HTTP 연결 및 리소스 로드 검증
  - 코드 Push 후 신규 배포 워크플로우 수행 관찰.
  - OCI 서버의 `sr-net` 브리지 네트워크 MTU가 1400으로 정상 변경되었는지 `ip link show` 로 검증.
  - 사용자 단에서 다시 `http://134.185.106.129`로 접속하여 CSS/JS 정적 파일 타임아웃(`net::ERR_CONNECTION_TIMED_OUT`) 해결 및 디자인 정상화 여부 검증.
- [ ] **Summarize**: 결과 요약 및 보고
  - `next.config.ts`, `Dockerfile`, `docker-compose.prod.yml` 파일 변경사항 최종 정리.
