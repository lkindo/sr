# Upstash Redis 설정 가이드

이 문서는 SR Management 시스템에서 Upstash Redis를 설정하는 방법을 설명합니다.

---

## 📋 목차

1. [Upstash Redis란?](#upstash-redis란)
2. [계정 생성 및 데이터베이스 생성](#계정-생성-및-데이터베이스-생성)
3. [환경 변수 설정](#환경-변수-설정)
4. [설정 확인](#설정-확인)
5. [캐싱 전략](#캐싱-전략)

---

## Upstash Redis란?

**Upstash Redis**는 Serverless Redis 서비스로, 다음과 같은 특징이 있습니다:

- ✅ **Serverless**: 사용량 기반 과금, 유휴 시 비용 없음
- ✅ **REST API**: HTTP 기반, Vercel Edge Functions 호환
- ✅ **저지연**: 전역 복제 지원
- ✅ **무료 플랜**: 10,000 requests/day

**사용 목적:**

- 대시보드 통계 캐싱
- 사용자 권한 정보 캐싱
- API 응답 캐싱
- 세션 스토어 (선택적)

---

## 계정 생성 및 데이터베이스 생성

### 1. Upstash 계정 생성

1. [https://upstash.com/](https://upstash.com/) 접속
2. **"Sign Up"** 클릭
3. GitHub 또는 이메일로 계정 생성

### 2. Redis 데이터베이스 생성

1. 대시보드에서 **"Create Database"** 클릭
2. **Database Name** 입력 (예: `sr-management-cache`)
3. **Region** 선택:
   - 한국 사용자: `ap-northeast-2` (Seoul) 권장
   - 글로벌: `us-east-1` (N. Virginia) 권장
4. **Type** 선택:
   - **Regional**: 단일 리전 (저렴, 빠름)
   - **Global**: 전역 복제 (비싸지만 더 빠름)
5. **"Create"** 클릭

### 3. REST API 정보 복사

1. 생성된 데이터베이스 클릭
2. **"REST API"** 탭 클릭
3. 다음 정보 복사:
   - **UPSTASH_REDIS_REST_URL**: `https://xxx-xxx-xxx.upstash.io`
   - **UPSTASH_REDIS_REST_TOKEN**: `AXxxxxx...` (긴 토큰)

---

## 환경 변수 설정

### 1. .env 파일 수정

프로젝트 루트의 `env` 파일을 열고 다음 값을 입력:

```env
# Upstash Redis (캐싱 및 세션 스토어)
UPSTASH_REDIS_REST_URL="https://xxx-xxx-xxx.upstash.io"
UPSTASH_REDIS_REST_TOKEN="AXxxxxx..."
```

### 2. Vercel 배포 시 환경 변수 설정

Vercel 대시보드에서도 동일한 환경 변수를 설정해야 합니다:

1. Vercel 프로젝트 대시보드 접속
2. **Settings** → **Environment Variables** 클릭
3. 다음 변수 추가:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
4. **"Save"** 클릭

---

## 설정 확인

### 1. 개발 서버 재시작

환경 변수를 변경한 후 개발 서버를 재시작합니다:

```bash
# 개발 서버 중지 (Ctrl+C)
# 개발 서버 재시작
npm run dev
```

### 2. 로그 확인

개발 서버 시작 시 다음과 같은 로그가 표시되면 정상입니다:

```
✅ Redis 초기화 성공
```

Redis가 설정되지 않았거나 오류가 발생하면:

```
⚠️ Redis 초기화 실패 (선택적 기능): [오류 메시지]
```

이 경우에도 애플리케이션은 정상 작동하지만, 캐싱 기능은 사용되지 않습니다.

### 3. 캐싱 동작 확인

1. 대시보드 페이지 접속
2. 첫 번째 요청: 데이터베이스에서 조회 (느림)
3. 두 번째 요청: Redis 캐시에서 조회 (빠름)

---

## 캐싱 전략

### 캐시 TTL (Time To Live)

| 데이터 유형      | TTL           | 이유                          |
| ---------------- | ------------- | ----------------------------- |
| 대시보드 통계    | 5분 (300초)   | 자주 변경되지만 실시간성 중요 |
| 사용자 권한      | 10분 (600초)  | 자주 변경되지 않음            |
| 권한 목록        | 30분 (1800초) | 거의 변경되지 않음            |
| 사용자 전체 정보 | 10분 (600초)  | 권한 정보 포함                |

### 캐시 무효화

다음 상황에서 자동으로 캐시가 무효화됩니다:

- 사용자 활성화/비활성화
- 역할 권한 변경
- 사용자 역할 변경

---

## 비용

### 무료 플랜

- **10,000 requests/day**
- **256 MB 저장 공간**
- **지역별 데이터베이스**

### 유료 플랜

- **$0.20 per 100K requests**
- **$0.20 per GB storage**
- **전역 복제 지원**

**예상 비용 (소규모 프로젝트):**

- 일일 요청: ~50,000 requests
- 월 비용: 약 $3-5

---

## 문제 해결

### Redis 연결 실패

**증상:**

```
Redis 초기화 실패 (선택적 기능): [오류 메시지]
```

**해결 방법:**

1. `.env` 파일의 `UPSTASH_REDIS_REST_URL`과 `UPSTASH_REDIS_REST_TOKEN` 확인
2. Upstash 대시보드에서 데이터베이스 상태 확인
3. 네트워크 연결 확인
4. 개발 서버 재시작

### 캐시가 작동하지 않음

**확인 사항:**

1. 환경 변수가 올바르게 설정되었는지 확인
2. 개발 서버 재시작
3. 브라우저 콘솔에서 네트워크 탭 확인
4. Upstash 대시보드에서 요청 로그 확인

---

## 참고 자료

- [Upstash 공식 문서](https://upstash.com/docs)
- [Upstash Redis 시작 가이드](https://upstash.com/docs/redis/overall/getstarted)
- [@upstash/redis 패키지](https://github.com/upstash/upstash-redis)

---

## 요약

1. ✅ Upstash 계정 생성
2. ✅ Redis 데이터베이스 생성
3. ✅ REST API 정보 복사
4. ✅ `.env` 파일에 환경 변수 설정
5. ✅ 개발 서버 재시작
6. ✅ 캐싱 동작 확인

**참고:** Redis는 선택적 기능입니다. 설정하지 않아도 애플리케이션이 정상 작동합니다.
