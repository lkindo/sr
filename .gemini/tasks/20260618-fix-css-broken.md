# Task: 포트 80 디자인 깨짐(HSTS 비활성화 및 권한 이슈) 해결

## 📋 진행 상태

- [x] **Think**: 문제 원인 분석 (HSTS 헤더에 의한 브라우저 HTTPS 리다이렉션으로 리소스 차단 가능성, Dockerfile 권한 문제 검토)
  - 원인: `next.config.ts`에서 설정된 `Strict-Transport-Security` (HSTS) 헤더로 인해 브라우저가 80포트 접속 후 강제로 443(HTTPS)으로 CSS/JS 등의 자산을 호출하려다 연결 실패(443 미가동)함.
  - 추가 원인: 사용자가 공유한 콘솔 에러에서 `https://134.185.106.129/...` 경로 호출과 `ERR_CONNECTION_TIMED_OUT`이 지속 검출됨. 브라우저가 HSTS 강제 캐싱으로 인해 80포트로 접속해도 내부 307 리다이렉션을 통해 HTTPS(443)로 요청하고 있어 443 포트 개방 및 HTTPS 호스팅이 필수적임.
- [x] **Plan**: 수정 계획 정의 (next.config.ts의 HSTS 제거, Dockerfile의 public 폴더 chown 추가, 빌드 & 배포 트리거)
  1. `next.config.ts`에서 HSTS 헤더 제거 및 `Dockerfile` 정적 자산 소유권 보완. (완료)
  2. `docker-compose.prod.yml`에 MTU 1400 네트워크 반영. (완료)
  3. `nginx` 서비스를 추가하고 443(HTTPS) 포트 개방 및 자가 서명 SSL 인증서 자동 구성 로직 반영. (완료)
  4. Git Commit & Push하여 GitHub Actions 워크플로우 실행 및 서버 배포 진행. (진행 중)
- [x] **Implement**: 코드 수정 반영
  - `next.config.ts`, `Dockerfile` 수정 완료.
  - `nginx/nginx.conf` 추가 완료 (HTTP to HTTPS 301 리다이렉션 및 Next.js 3000포트 프록싱).
  - `docker-compose.prod.yml`에 Nginx 서비스 추가 및 Next.js 포트 격리.
  - `.github/workflows/deploy.yml`에 OS 방화벽 443 포트 추가 및 OpenSSL 자가 서명 키 자동 생성(없을 시) 구문 추가 완료.
- [x] **Test**: 배포 후 HTTP 연결 및 리소스 로드 검증
  - 코드 Push 후 신규 배포 워크플로우 정상 빌드 및 배포 완료 (성공).
  - OCI 서버 상에서 `firewall-cmd --list-all` 로 검증 결과, 443 포트가 성공적으로 오픈 적용되었음을 확인.
  - `docker ps` 결과, `sr-nginx`, `sr-app`, `sr-db` 컨테이너 3개가 정상 가동 중이며 포트 80과 443이 Nginx로 안전하게 프록시 매핑되었음을 교체 확인.
  - 외부 HTTPS `curl -k -I` 테스트 결과, 타임아웃 없이 Nginx가 즉시 SSL 통신을 처리하고 Next.js 앱으로 프록시 포워딩함을 완벽히 확인.
- [x] **Summarize**: 결과 요약 및 보고
  - Nginx Reverse Proxy 도입 및 HTTPS/SSL 자가 서명 환경 구축 완료 보고.
  - 443 포트 방화벽 처리 및 Nginx standalone 볼륨 격리 완료.
