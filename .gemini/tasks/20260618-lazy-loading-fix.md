# 20260618-lazy-loading-fix

이벤트 리스너 지연 로딩(Lazy Loading) 보완 작업을 OCI 실서버의 제약을 우회하여 배포 및 검증하는 태스크.

## 📋 진행 상태 체크리스트

- [x] **Think** — 요구사항 분석 및 기존 코드 영향 파악
  - [x] instrumentation.ts 훅의 동작 원리 분석 및 `@/services/service-registry` 로드 위치 검토
  - [x] OCI 아웃바운드 차단 및 로컬 standalone EPERM 권한 오류 해결 방안 정의 (볼륨 마운트 우회)
- [x] **Plan** — 구체적 수정/추가 단계 정의
  - [x] `instrumentation.ts` 수정 및 `next.config.ts` 임시 주석 처리 계획 수립
  - [x] 로컬 빌드 -> 압축 -> SCP 전송 -> OCI 볼륨 마운트 후 재구동 파이프라인 수립
- [/] **Implement** — 코드 작성 및 리팩토링
  - [x] `instrumentation.ts`에 즉시 로드 구문 추가 완료
  - [/] 로컬 빌드 및 OCI 전송, 볼륨 마운트 적용 대기 중
- [ ] **Test** — 테스트·빌드 실행으로 검증
  - [ ] OCI 서버 재시작 및 부팅 로그(`Service registry & event listeners registered`) 확인 검증
- [ ] **Summarize** — 결과 요약 및 다음 루프 준비
