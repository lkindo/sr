
# SR(Service Request) 관리 시스템 PRD

**문서 버전:** 1.0  
**작성일:** 2025년 11월  
**최종 수정일:** 2025년 11월  
**작성자:** Product Team

---

## 목차

1. [개요](#개요)
2. [비즈니스 목표](#비즈니스-목표)
3. [핵심 기능](#핵심-기능)
4. [사용자 유형](#사용자-유형)
5. [상세 요구사항](#상세-요구사항)
6. [시스템 아키텍처](#시스템-아키텍처)
7. [데이터 모델](#데이터-모델)
8. [보안 및 권한](#보안-및-권한)
9. [알림 시스템](#알림-시스템)
10. [UI/UX 요구사항](#uiux-요구사항)
11. [성능 요구사항](#성능-요구사항)
12. [마이그레이션 및 운영](#마이그레이션-및-운영)

---

## 개요

### 시스템 소개

SR 관리 시스템은 여러 고객사로부터 수신된 Service Request를 중앙에서 통합 관리하고, 고객사별 사전 배정된 담당자에게 자동으로 알림을 전송하는 통합 관리 플랫폼입니다. 본 시스템을 통해 SR의 신청부터 접수, 처리, 완료까지의 전체 생명주기를 효율적으로 관리할 수 있습니다.

### 목적

- 여러 고객사의 SR을 통합 관리하여 서비스 품질 향상
- 자동 알림 기능을 통한 처리 속도 개선
- 투명한 권한 관리 및 접근 제어
- 실시간 모니터링 및 현황 파악
- 처리 절차의 표준화 및 추적 가능성 확보

---

## 비즈니스 목표

1. **신청 처리 시간 단축**: 자동 알림을 통해 평균 처리 시간을 50% 이상 단축
2. **고객 만족도 향상**: 실시간 진행 상황 추적으로 투명성 확보
3. **운영 효율성 개선**: 수동 알림 작업 제거 및 자동화
4. **데이터 기반 의사결정**: SR 통계 및 분석 기능 제공
5. **확장성**: 고객사 및 사용자 증가에 따른 유연한 확장

---

## 핵심 기능

### 1. 고객사 관리 (Client Management)
- 고객사 정보 등록 및 관리
- 고객사별 담당자 배정
- 고객사별 서비스 카테고리 설정
- 고객사 상태 관리 (활성, 휴면, 종료)

### 2. 사용자 관리 (User Management)
- 회원가입 및 프로필 관리
- 사용자별 고객사 배정
- 사용자 상태 관리 (활성, 비활성, 휴면)
- 부서/팀 관리

### 3. 권한 관리 (Permission Management)
- 역할 기반 접근 제어(RBAC)
- 세분화된 권한 관리
- 고객사별 권한 구분

### 4. SR 관리 (Service Request Management)
- SR 신청 및 접수
- SR 상태 추적 (신청, 접수, 진행중, 완료, 보류, 거절)
- SR 우선순위 설정
- SR 첨부파일 관리

### 5. 자동 알림 시스템 (Notification System)
- 이메일 알림
- 매터모스트 알림
- 알림 템플릿 관리
- 알림 발송 기록 추적

### 6. 모니터링 및 대시보드 (Monitoring & Dashboard)
- 실시간 SR 현황 대시보드
- 담당자별 SR 현황
- 고객사별 SR 현황
- 기간별 통계 및 분석

### 7. 보고 및 분석 (Reporting & Analytics)
- SR 처리 보고서
- 담당자별 처리 성과
- 고객사별 만족도
- 월별/분기별 추세 분석

---

## 사용자 유형

### 1. 시스템 관리자 (System Administrator)
- 역할: 전체 시스템 관리 및 설정
- 권한: 모든 기능 접근, 사용자/고객사 관리, 권한 설정
- 주요 활동: 사용자 관리, 고객사 관리, 시스템 설정

### 2. 고객사 관리자 (Client Administrator)
- 역할: 해당 고객사의 관리 담당
- 권한: 해당 고객사의 모든 SR 조회, 사용자 관리, 보고
- 주요 활동: 사용자 관리, SR 현황 모니터링, 보고서 생성

### 3. SR 담당자 (SR Handler/Support Staff)
- 역할: SR 접수 및 처리
- 권한: 할당된 SR 접수 및 처리, 진행 상황 업데이트
- 주요 활동: SR 접수, 상태 변경, 처리 완료

### 4. SR 신청자 (SR Requestor/End User)
- 역할: SR 신청
- 권한: 본인이 신청한 SR 조회 및 진행 상황 확인
- 주요 활동: SR 신청, 현황 조회

### 5. 보고 담당자 (Report Manager)
- 역할: SR 통계 및 분석 보고
- 권한: 모든 SR 데이터 조회, 보고서 생성
- 주요 활동: 통계 분석, 보고서 생성, 데이터 추출

---

## 상세 요구사항

### 1. 회원가입 및 사용자 관리

#### 1.1 회원가입 프로세스
```
사용자가 회원가입 화면에 접속 → 기본 정보 입력 → 고객사 검색 → 고객사 선택 → 
고객사별 부서/팀 선택 → 이메일 인증 → 가입 완료
```

**입력 항목:**
- 사용자명
- 이메일 주소 (고유값)
- 비밀번호 (보안 요구사항 만족)
- 휴대폰 번호
- 고객사 검색 및 선택 (자동완성 기능)
- 부서/팀 선택
- 직급/직위

**검증 규칙:**

```typescript
// src/lib/validations.ts

import { z } from 'zod'

/**
 * 공통 검증 규칙
 */

// 이메일
export const emailSchema = z.string()
  .email('유효한 이메일 주소를 입력해주세요')
  .max(255, '이메일은 최대 255자까지 입력 가능합니다')

// 비밀번호
export const passwordSchema = z.string()
  .min(8, '비밀번호는 최소 8자 이상이어야 합니다')
  .max(100, '비밀번호는 최대 100자까지 입력 가능합니다')
  .regex(/[A-Z]/, '비밀번호는 최소 1개의 대문자를 포함해야 합니다')
  .regex(/[a-z]/, '비밀번호는 최소 1개의 소문자를 포함해야 합니다')
  .regex(/[0-9]/, '비밀번호는 최소 1개의 숫자를 포함해야 합니다')
  .regex(/[^A-Za-z0-9]/, '비밀번호는 최소 1개의 특수문자를 포함해야 합니다')

// 전화번호 (한국)
export const phoneSchema = z.string()
  .regex(/^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/, '유효한 전화번호를 입력해주세요 (예: 010-1234-5678)')

// CUID
export const cuidSchema = z.string().cuid('유효하지 않은 ID 형식입니다')

/**
 * SR 검증
 */
export const createSRSchema = z.object({
  title: z.string()
    .min(5, 'SR 제목은 최소 5자 이상이어야 합니다')
    .max(200, 'SR 제목은 최대 200자까지 입력 가능합니다')
    .refine(
      (val) => val.trim().length >= 5,
      'SR 제목은 공백을 제외하고 최소 5자 이상이어야 합니다'
    ),

  description: z.string()
    .min(20, 'SR 상세 설명은 최소 20자 이상이어야 합니다')
    .max(5000, 'SR 상세 설명은 최대 5000자까지 입력 가능합니다')
    .refine(
      (val) => val.trim().length >= 20,
      'SR 상세 설명은 공백을 제외하고 최소 20자 이상이어야 합니다'
    ),

  clientId: cuidSchema,
  serviceCategoryId: cuidSchema,

  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'], {
    errorMap: () => ({ message: '유효한 우선순위를 선택해주세요' })
  }).default('MEDIUM'),

  expectedCompletionDate: z.date()
    .min(new Date(), '희망 완료 날짜는 현재 시간 이후여야 합니다')
    .optional()
})

/**
 * 사용자 생성 검증
 */
export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string(),
  name: z.string()
    .min(2, '이름은 최소 2자 이상이어야 합니다')
    .max(100, '이름은 최대 100자까지 입력 가능합니다'),
  phone: phoneSchema,
  clientId: cuidSchema
}).refine(
  (data) => data.password === data.confirmPassword,
  {
    message: '비밀번호가 일치하지 않습니다',
    path: ['confirmPassword']
  }
)

/**
 * 고객사 생성 검증
 */
export const createClientSchema = z.object({
  code: z.string()
    .min(2, '고객사 코드는 최소 2자 이상이어야 합니다')
    .max(10, '고객사 코드는 최대 10자까지 입력 가능합니다')
    .regex(/^[A-Z0-9]+$/, '고객사 코드는 대문자 영문과 숫자만 사용 가능합니다'),

  name: z.string()
    .min(2, '고객사명은 최소 2자 이상이어야 합니다')
    .max(200, '고객사명은 최대 200자까지 입력 가능합니다'),

  contactEmail: emailSchema.optional(),
  contactPhone: phoneSchema.optional(),

  contractStartDate: z.date().optional(),
  contractEndDate: z.date().optional()
}).refine(
  (data) => {
    if (data.contractStartDate && data.contractEndDate) {
      return data.contractEndDate > data.contractStartDate
    }
    return true
  },
  {
    message: '계약 종료일은 시작일 이후여야 합니다',
    path: ['contractEndDate']
  }
)

/**
 * 파일 업로드 검증
 */
export const fileUploadSchema = z.object({
  fileName: z.string()
    .min(1, '파일명이 필요합니다')
    .max(255, '파일명은 최대 255자까지 가능합니다'),

  fileSize: z.number()
    .min(1, '파일이 비어있습니다')
    .max(10 * 1024 * 1024, '파일 크기는 10MB를 초과할 수 없습니다'),

  fileType: z.string()
    .regex(/^[a-z]+\/[a-z0-9\-\+\.]+$/, '유효하지 않은 파일 타입입니다'),

  fileUrl: z.string().url('유효한 URL이 아닙니다')
})

// 허용된 파일 타입
export const ALLOWED_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'application/zip',
  'application/x-zip-compressed'
]

export function isAllowedFileType(mimeType: string): boolean {
  return ALLOWED_FILE_TYPES.includes(mimeType)
}
```

**사후 관리:**
- 이메일 인증 메일 자동 발송
- 인증 링크 유효 기간: 24시간
- 가입 완료 후 웰컴 이메일 발송
- 초기 로그인 시 비밀번호 변경 권유

#### 1.2 사용자 프로필 관리
- 프로필 조회 및 수정
- 비밀번호 변경
- 휴대폰 번호 변경
- 고객사 변경 (관리자 승인 필요)
- 부서/팀 변경
- 프로필 사진 등록

#### 1.3 사용자 상태 관리
- 활성: 모든 기능 사용 가능
- 비활성: 관리자가 임시 비활성화, 재활성화 가능
- 휴면: 6개월 이상 미사용 자동 변경, 관리자 승인으로 재활성화
- 삭제: 논리적 삭제, 복구 기능 제공

#### 1.4 사용자 일괄 관리
- 엑셀 import를 통한 일괄 등록
- 사용자 목록 export
- 사용자 상태 일괄 변경
- 권한 일괄 설정

### 2. 고객사 관리

#### 2.1 고객사 기본 정보
**필수 정보:**
- 고객사 명 (고유값)
- 고객사 코드 (고유값, 시스템 자동 생성 가능)
- 업종/산업군
- 지역/위치
- 담당 관리자 (다중 선택 가능)
- 주요 연락처 (이메일, 전화번호)
- 계약 시작일
- 계약 종료일

#### 2.2 고객사별 담당자 배정
- 담당자 1인 이상 필수 배정
- 1인 담당자가 여러 고객사 담당 가능
- 담당자별 연락처 (이메일, 매터모스트 아이디)
- 담당자 교체 시 이전 기록 추적 가능
- 담당 담당자별 처리 시간대 설정 가능

#### 2.3 고객사별 서비스 카테고리 설정
- 고객사별 서비스 유형 커스터마이징
- 예시: Technical Support, Billing, Account Management 등
- 카테고리별 처리 우선순위 설정
- 카테고리별 담당자 2차 배정 가능

#### 2.4 고객사 상태 관리
- 활성: 정상 서비스 중
- 휴면: 일시적 미사용
- 종료: 계약 종료
- 보류: 특별 상황 (지원 중단 등)


### 3. 권한 관리 (RBAC)

#### 3.1 역할 정의

**시스템 관리자 (SYSTEM_ADMIN)**
- 권한: 전체 시스템 접근, 모든 기능 실행
- 할당 권한:
  - 사용자 등록/수정/삭제 (user:create, user:read, user:update, user:delete)
  - 고객사 등록/수정/삭제 (client:create, client:read, client:update, client:delete)
  - 역할 및 권한 관리 (role:manage)
  - 시스템 설정 (system:admin)
  - 전체 SR 조회/수정/삭제 (sr:create, sr:read, sr:update, sr:delete)
  - 보고서 생성 및 내보내기 (report:generate, report:export)
  - 백업 및 복구

**고객사 관리자 (CLIENT_ADMIN)**
- 권한: 해당 고객사 관련 모든 기능
- 할당 권한:
  - 해당 고객사 사용자 등록/수정/삭제 (user:create, user:read, user:update within client)
  - 해당 고객사 SR 조회/수정/상태변경 (sr:read, sr:update within client)
  - 해당 고객사 담당자 배정 변경
  - 해당 고객사 보고서 생성 (report:read within client)
  - 해당 고객사 통계 조회

**개발자 (DEVELOPER)**
- 권한: SR 접수 및 처리
- 할당 권한:
  - 할당된 SR 조회 및 처리 (sr:read, sr:update for assigned SRs)
  - SR 상태 변경 (sr:update)
  - 댓글 작성 (sr:comment)
  - 첨부파일 관리 (sr:attachment)
  - 진행 상황 업데이트

**고객사 사용자 (CLIENT_USER)**
- 권한: SR 신청 및 조회
- 할당 권한:
  - SR 신청 (sr:create)
  - 본인 SR 조회 (sr:read for owned SRs)
  - 진행 상황 추적
  - 댓글 작성 (sr:comment)
  - 보고서 조회 (report:read)

#### 3.2 세분화된 권한 관리
```
각 기능별 권한 설정 가능:
- SR 조회 (Read)
- SR 생성 (Create)
- SR 수정 (Update)
- SR 삭제 (Delete)
- SR 상태 변경 (Status Change)
- 댓글 작성 (Comment)
- 첨부파일 다운로드 (Download)
- 보고서 생성 (Report Generate)
- 데이터 export (Export)
```

#### 3.3 고객사별 권한 구분
- 사용자가 여러 고객사에 속할 수 있음
- 고객사별로 다른 역할 할당 가능
- 고객사별로 접근 범위 제한

#### 3.4 권한 모니터링 및 감사
- 권한 변경 기록 유지
- 권한 남용 모니터링
- 권한 변경 로그 조회
- 주기적 권한 재인증

### 4. SR 관리 프로세스

#### 4.1 SR 신청 (SR Creation)

**신청 채널:**
- 웹 포털
- 이메일 (자동 파싱 기능 - 옵션)
- API (3rd party 통합)

**SR 신청 화면:**
```
신청 고객사 선택 → 제목 입력 → 내용 입력 → 
서비스 카테고리 선택 → 우선순위 선택 → 
첨부파일 등록 → 신청 완료
```

**필수 항목:**
- 신청 고객사 (자신이 소속된 고객사만 선택 가능)
- SR 제목
- SR 상세 설명
- 서비스 카테고리
- 첨부파일 (선택)

**선택 항목:**
- 우선순위 (기본값: 중)
- 희망 완료 날짜
- 추가 연락처 정보

**자동 처리:**
- SR 고유 ID 자동 생성 (형식: [고객사코드]-[YYYYMMDD]-[번호])
- SR 신청자 정보 자동 입력
- 신청 시간 자동 기록
- SR 상태를 "신청" 상태로 설정

#### 4.2 SR 접수 (SR Intake)

**접수 프로세스:**
```
SR 신청 → 자동 알림 발송 → 담당자 확인 및 검토 → 
접수 승인 또는 반려
```

**담당자 접수 요청:**
- 신청 고객사 담당자에게 이메일 + 매터모스트 알림
- 알림 내용: SR ID, 제목, 신청자 정보, 신청 시간
- 접수 예상 시간: 24시간 이내

**접수 시 처리:**
- SR 상태를 "접수" 상태로 변경
- 접수 담당자 정보 기록
- 접수 시간 기록
- 신청자에게 접수 확인 메일 발송
- 예상 처리 완료 날짜 설정 (카테고리별 기본값 사용)

**거절 시 처리:**
- SR 상태를 "거절" 상태로 변경
- 거절 사유 입력 (필수)
- 신청자에게 거절 사유 메일 발송
- 신청자가 수정 후 재신청 가능

#### 4.3 SR 진행 (SR In Progress)

**진행 상태 관리:**
- SR 상태를 "진행중" 상태로 변경
- 실시간 진행 상황 업데이트
- 진행 담당자 정보 기록
- 예상 완료 날짜 수정 가능

**진행 중 활동:**
- 댓글 작성 (내부 노트 및 고객 공개 댓글 구분)
- 첨부파일 추가 등록
- 우선순위 변경
- 담당자 재배정 (필요시)
- 상태 업데이트

**알림 및 모니터링:**
- 장기 미처리 SR 알림 (설정 가능한 시간 초과 시)
- 담당자 변경 시 신 담당자에게 알림

#### 4.4 SR 완료 (SR Completion)

**완료 프로세스:**
```
담당자가 완료 버튼 클릭 → 완료 내용 입력 → 
완료 처리 → 신청자에게 완료 알림 → 
신청자가 확인 및 만족도 평가
```

**완료 시 처리:**
- SR 상태를 "완료" 상태로 변경
- 완료 내용 입력 (필수)
- 완료 담당자 정보 기록
- 실제 완료 시간 기록
- 처리 소요 시간 자동 계산

**신청자 확인:**
- 신청자에게 완료 알림 메일 발송
- 신청자가 "확인" 버튼 클릭하여 최종 확인
- 추가 의견 입력 가능

**완료 후 처리:**
- SR 상태를 "확인완료" 상태로 변경
- 관리자가 통계 및 분석에 포함
- 재오픈 가능 (완료 후 7일 이내, 1회만)

#### 4.5 SR 보류 및 기타 상태

**보류 (Hold)**
- 추가 정보 대기 중
- 고객 응답 대기
- 외부 의존성 대기
- 보류 사유 입력 (필수)
- 예상 해제 날짜 설정

**재오픈 (Reopen)**
- 완료 후 7일 이내 재오픈 가능
- 재오픈 사유 입력 (필수)
- SR 상태를 다시 "진행중"으로 변경

**거절 (Rejected)**
- 신청 거절 또는 중도 거절 가능
- 거절 사유 입력 (필수)
- 신청자 및 담당자에게 알림

#### 4.6 SR 상태 변경 규칙
```
신청 → 접수 → 진행중 → 완료 → 확인완료
  ↘ 거절 (신청 또는 접수 단계)
진행중 → 보류 → 진행중 (보류 해제)
        ↘ 거절 (보류 중 취소)
확인완료 → 재오픈 → 진행중 (확인 완료 후 재발견 시)
```

#### 4.7 SR 우선순위
```
긴급 (Critical): 1시간 내 접수, 4시간 내 완료
높음 (High): 2시간 내 접수, 24시간 내 완료
중간 (Medium): 24시간 내 접수, 48시간 내 완료
낮음 (Low): 48시간 내 접수, 1주일 내 완료
```

#### 4.8 SR 첨부파일 관리
- 지원 파일: 이미지, 문서, 압축파일 등 (설정 가능)
- 파일 크기 제한: 100MB 이하
- 최대 첨부파일 개수: 10개
- 바이러스 검사: 자동 수행
- 파일 보안: 암호화 저장
- 다운로드 권한: 역할별 제어

### 5. 자동 알림 시스템

#### 5.1 이메일 알림
- LLD.md의 8. [알림 시스템](#알림-시스템) 참조

**알림 템플릿:**
- 기본 템플릿 제공 (이메일 제목, 본문)
- 관리자가 템플릿 커스터마이징 가능
- 변수 지원: {SR_ID}, {제목}, {신청자}, {담당자}, {내용} 등

**알림 내용 예시:**

```
이메일 제목: [SR#{SR_ID}] {제목} - 담당자 배정

이메일 본문:
안녕하세요 {담당자명}님,

새로운 SR이 귀하에게 배정되었습니다.

■ SR 정보
- SR ID: {SR_ID}
- 고객사: {고객사명}
- 제목: {제목}
- 신청자: {신청자명}
- 신청일시: {신청일시}
- 우선순위: {우선순위}
- 예상 완료: {예상완료일}

■ 링크
[SR 상세 정보 조회](URL)

빠른 접수 부탁드립니다.

감사합니다.
```

**이메일 발송:**
- 비동기 처리 (큐 기반)
- 발송 실패 시 재시도 (최대 3회, 1시간 간격)
- 발송 로그 기록
- 발송 상태 추적 가능

#### 5.2 매터모스트(Mattermost) 알림

**알림 채널:**
- 개인 DM: 직접 메시지
- 채널: #sr-notifications 등 공용 채널
- 사용자별 설정으로 선택 가능

**알림 포맷:**
```
[SR 신청됨] #SR-20251106-001
제목: 로그인 오류 발생
고객사: ABC Company
신청자: 김철수
우선순위: 높음

[상세보기](URL) | [접수](URL)
```

**알림 발송:**
- 즉시 발송 (이메일보다 빠름)
- 매터모스트 API 사용
- 발송 실패 시 폴백 (이메일로 발송)

#### 5.3 알림 수신 관리

**알림 수신 설정:**
- 사용자가 알림 채널 선택 (이메일, 매터모스트, 둘 다)
- 알림 수신 시간 설정 (24시간 수신 또는 업무 시간만)
- 알림 유형별 세부 설정
- 일시 중지 기능 (휴가 등)

**알림 유형별 설정:**
- 신규 SR 알림: On/Off
- 완료 알림: On/Off
- 거절 알림: On/Off
- 보류 알림: On/Off
- 장기 미처리 경고: On/Off

#### 5.4 알림 실패 처리

**실패 감지:**
- 이메일 발송 실패 시 자동 재시도
- 매터모스트 발송 실패 시 이메일로 폴백
- 사용자 정보 오류 시 관리자 알림

**알림 로그:**
- 모든 알림 발송 기록
- 발송 성공/실패 상태 기록
- 발송 시간 기록
- 사용자 영구 보관

---

## API 명세

### Server Actions (Next.js 14)

본 시스템은 Next.js 14의 Server Actions를 주요 API 방식으로 사용합니다.

#### SR 관리 API

1. **createSR** - SR 생성
   - Input: title, description, clientId, serviceCategoryId, priority, attachments (optional)
   - Output: SR 정보 (id, srNumber, status, createdAt, dueDate)
   - 권한: CLIENT_USER, DEVELOPER, CLIENT_ADMIN, SYSTEM_ADMIN

2. **getSR** - SR 조회
   - Input: srId
   - Output: 전체 SR 정보 (client, requester, assignee, activities 포함)
   - 권한: SR 관련자 또는 SYSTEM_ADMIN

3. **getSRList** - SR 목록 조회
   - Input: filters (status, priority, clientId, assigneeId, search), pagination (page, limit)
   - Output: SR 목록 + pagination 정보
   - 권한: 본인 관련 SR 또는 SYSTEM_ADMIN

4. **updateSR** - SR 수정
   - Input: srId, title, description, priority, serviceCategoryId (optional)
   - 권한: SR 소유자 (REQUESTED 상태) 또는 담당자 또는 SYSTEM_ADMIN

5. **updateSRStatus** - SR 상태 변경
   - Input: srId, status, reason (optional), resolutionDescription (optional)
   - 상태 전이 규칙 적용
   - 권한: 상태별 권한 체크

6. **assignSR** - SR 담당자 배정
   - Input: srId, assigneeId
   - 권한: DEVELOPER (본인만), CLIENT_ADMIN, SYSTEM_ADMIN

#### SR 댓글 API

7. **createSRComment** - 댓글 작성
   - Input: srId, content, isInternal (default: false)
   - 권한: SR 관련자 (내부 노트는 DEVELOPER, SYSTEM_ADMIN만)

8. **getSRComments** - 댓글 목록 조회
   - Input: srId, includeInternal (optional)
   - 권한: SR 관련자 (내부 노트는 DEVELOPER, SYSTEM_ADMIN만)

9. **updateSRComment** - 댓글 수정
   - Input: commentId, content
   - 권한: 댓글 작성자

10. **deleteSRComment** - 댓글 삭제
    - Input: commentId
    - 권한: 댓글 작성자 또는 SYSTEM_ADMIN

#### SR 첨부파일 API

11. **uploadSRAttachment** - 첨부파일 업로드
    - Input: srId, file (최대 100MB)
    - Output: 파일 정보 (id, fileName, fileUrl)
    - 권한: SR 관련자

12. **getSRAttachments** - 첨부파일 목록
    - Input: srId
    - 권한: SR 관련자

13. **downloadSRAttachment** - 첨부파일 다운로드
    - Input: attachmentId
    - 권한: SR 관련자

14. **deleteSRAttachment** - 첨부파일 삭제
    - Input: attachmentId
    - 권한: 업로드한 사용자 또는 SYSTEM_ADMIN

#### 고객사 관리 API

15. **createClient** - 고객사 생성
    - Input: code, name, industry, contactPerson, contactEmail, contactPhone, contractStartDate, contractEndDate
    - 권한: SYSTEM_ADMIN

16. **getClient** - 고객사 조회
    - Input: clientId
    - 권한: 해당 고객사 소속 또는 SYSTEM_ADMIN

17. **getClientList** - 고객사 목록
    - Input: isActive, search, pagination
    - 권한: SYSTEM_ADMIN (전체), CLIENT_ADMIN (본인 고객사만)

18. **updateClient** - 고객사 수정
    - Input: clientId, 수정할 필드들
    - 권한: CLIENT_ADMIN (본인 고객사), SYSTEM_ADMIN

19. **deleteClient** - 고객사 삭제 (소프트 삭제)
    - Input: clientId
    - 권한: SYSTEM_ADMIN

#### 서비스 카테고리 API

20. **createServiceCategory** - 카테고리 생성
    - Input: clientId, categoryName, description, slaHours, priority, handlerId, backupHandlerId
    - 권한: CLIENT_ADMIN, SYSTEM_ADMIN

21. **getServiceCategories** - 카테고리 목록
    - Input: clientId, isActive
    - 권한: 해당 고객사 소속 또는 SYSTEM_ADMIN

22. **updateServiceCategory** - 카테고리 수정
    - Input: categoryId, 수정할 필드들
    - 권한: CLIENT_ADMIN, SYSTEM_ADMIN

23. **deleteServiceCategory** - 카테고리 삭제
    - Input: categoryId
    - 권한: CLIENT_ADMIN, SYSTEM_ADMIN

#### 사용자 관리 API

24. **createUser** - 사용자 생성
    - Input: email, name, phone, password, roleId, clientIds
    - 권한: SYSTEM_ADMIN, CLIENT_ADMIN (본인 고객사만)

25. **getUser** - 사용자 조회
    - Input: userId
    - 권한: 본인 또는 SYSTEM_ADMIN

26. **getUserList** - 사용자 목록
    - Input: clientId, roleId, isActive, search, pagination
    - 권한: SYSTEM_ADMIN (전체), CLIENT_ADMIN (본인 고객사만)

27. **updateUser** - 사용자 수정
    - Input: userId, 수정할 필드들
    - 권한: 본인 (일부 필드), SYSTEM_ADMIN (모든 필드)

28. **updateUserRole** - 사용자 역할 변경
    - Input: userId, roleId
    - 권한: SYSTEM_ADMIN

29. **deleteUser** - 사용자 삭제 (소프트 삭제)
    - Input: userId
    - 권한: SYSTEM_ADMIN

#### 대시보드 API

30. **getDashboardStats** - 대시보드 통계
    - Output: 전체 SR 수, 상태별 SR 수, 우선순위별 SR 수, SLA 위반 수, 최근 SR 목록
    - 권한: 본인 관련 데이터 또는 고객사별 데이터 또는 전체 데이터 (역할별)

31. **getMySRs** - 내 SR 목록
    - 본인이 신청한 SR 목록
    - 권한: 모든 사용자

32. **getAssignedSRs** - 할당된 SR 목록
    - 본인에게 할당된 SR 목록
    - 권한: DEVELOPER, SYSTEM_ADMIN

33. **getSLAViolations** - SLA 위반 SR 목록
    - SLA를 위반한 SR 목록 (violationType, deadline, overdueDays 포함)
    - 권한: DEVELOPER, CLIENT_ADMIN, SYSTEM_ADMIN

### API 응답 형식

모든 Server Action은 표준 응답 형식을 따릅니다:

**성공 응답**:
```typescript
{
  success: true,
  data: T  // 실제 데이터
}
```

**에러 응답**:
```typescript
{
  success: false,
  error: {
    code: string,      // 에러 코드 (예: "ERR_1001")
    message: string,   // 사용자 메시지
    details?: any      // 디버깅 정보 (개발 환경만)
  }
}
```

### 에러 코드 체계

- **1xxx**: 인증 관련 (ERR_1001: Unauthorized)
- **2xxx**: 권한 관련 (ERR_2001: Forbidden)
- **3xxx**: 검증 관련 (ERR_3001: ValidationError)
- **4xxx**: 리소스 관련 (ERR_4001: NotFoundError)
- **5xxx**: 서버 관련 (ERR_5001: InternalServerError)

상세한 API 구현 명세는 TRD(Technical Requirements Document)를 참조하세요.

### 5. 에러 코드 및 메시지 미정의

#### 🟡 Medium - 표준 에러 코드 정의 필요

**현재 상태:**
- 에러 메시지가 하드코딩됨
- 다국어 지원 불가
- 프론트엔드에서 에러 처리 어려움

**권장 해결책:**

```typescript
// src/types/errors.ts

export enum ErrorCode {
  // 인증 에러 (1000번대)
  UNAUTHORIZED = 'ERR_1001',
  INVALID_CREDENTIALS = 'ERR_1002',
  EMAIL_NOT_VERIFIED = 'ERR_1003',
  SESSION_EXPIRED = 'ERR_1004',

  // 권한 에러 (2000번대)
  FORBIDDEN = 'ERR_2001',
  INSUFFICIENT_PERMISSION = 'ERR_2002',
  CLIENT_ACCESS_DENIED = 'ERR_2003',

  // 검증 에러 (3000번대)
  VALIDATION_FAILED = 'ERR_3001',
  INVALID_INPUT = 'ERR_3002',
  REQUIRED_FIELD_MISSING = 'ERR_3003',
  INVALID_FORMAT = 'ERR_3004',

  // 리소스 에러 (4000번대)
  NOT_FOUND = 'ERR_4001',
  SR_NOT_FOUND = 'ERR_4002',
  CLIENT_NOT_FOUND = 'ERR_4003',
  USER_NOT_FOUND = 'ERR_4004',

  // 비즈니스 로직 에러 (5000번대)
  INVALID_STATE_TRANSITION = 'ERR_5001',
  SR_ALREADY_COMPLETED = 'ERR_5002',
  SLA_EXCEEDED = 'ERR_5003',
  DUPLICATE_SR_NUMBER = 'ERR_5004',

  // 파일 에러 (6000번대)
  FILE_TOO_LARGE = 'ERR_6001',
  INVALID_FILE_TYPE = 'ERR_6002',
  UPLOAD_FAILED = 'ERR_6003',

  // 시스템 에러 (9000번대)
  INTERNAL_SERVER_ERROR = 'ERR_9001',
  DATABASE_ERROR = 'ERR_9002',
  EXTERNAL_SERVICE_ERROR = 'ERR_9003'
}

/**
 * 에러 메시지 (한국어)
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  // 인증 에러
  [ErrorCode.UNAUTHORIZED]: '인증이 필요합니다',
  [ErrorCode.INVALID_CREDENTIALS]: '이메일 또는 비밀번호가 올바르지 않습니다',
  [ErrorCode.EMAIL_NOT_VERIFIED]: '이메일 인증이 완료되지 않았습니다',
  [ErrorCode.SESSION_EXPIRED]: '세션이 만료되었습니다. 다시 로그인해주세요',

  // 권한 에러
  [ErrorCode.FORBIDDEN]: '접근 권한이 없습니다',
  [ErrorCode.INSUFFICIENT_PERMISSION]: '해당 작업을 수행할 권한이 없습니다',
  [ErrorCode.CLIENT_ACCESS_DENIED]: '해당 고객사에 접근 권한이 없습니다',

  // 검증 에러
  [ErrorCode.VALIDATION_FAILED]: '입력값 검증에 실패했습니다',
  [ErrorCode.INVALID_INPUT]: '유효하지 않은 입력값입니다',
  [ErrorCode.REQUIRED_FIELD_MISSING]: '필수 항목이 누락되었습니다',
  [ErrorCode.INVALID_FORMAT]: '형식이 올바르지 않습니다',

  // 리소스 에러
  [ErrorCode.NOT_FOUND]: '요청한 리소스를 찾을 수 없습니다',
  [ErrorCode.SR_NOT_FOUND]: 'SR을 찾을 수 없습니다',
  [ErrorCode.CLIENT_NOT_FOUND]: '고객사를 찾을 수 없습니다',
  [ErrorCode.USER_NOT_FOUND]: '사용자를 찾을 수 없습니다',

  // 비즈니스 로직 에러
  [ErrorCode.INVALID_STATE_TRANSITION]: '현재 상태에서 해당 상태로 변경할 수 없습니다',
  [ErrorCode.SR_ALREADY_COMPLETED]: '이미 완료된 SR입니다',
  [ErrorCode.SLA_EXCEEDED]: 'SLA 기한이 초과되었습니다',
  [ErrorCode.DUPLICATE_SR_NUMBER]: 'SR 번호가 중복되었습니다',

  // 파일 에러
  [ErrorCode.FILE_TOO_LARGE]: '파일 크기가 너무 큽니다 (최대 10MB)',
  [ErrorCode.INVALID_FILE_TYPE]: '지원하지 않는 파일 형식입니다',
  [ErrorCode.UPLOAD_FAILED]: '파일 업로드에 실패했습니다',

  // 시스템 에러
  [ErrorCode.INTERNAL_SERVER_ERROR]: '서버 오류가 발생했습니다',
  [ErrorCode.DATABASE_ERROR]: '데이터베이스 오류가 발생했습니다',
  [ErrorCode.EXTERNAL_SERVICE_ERROR]: '외부 서비스 연동 중 오류가 발생했습니다'
}

/**
 * 표준 에러 응답
 */
export interface ErrorResponse {
  success: false
  error: {
    code: ErrorCode
    message: string
    details?: any
    timestamp: string
  }
}

/**
 * 에러 생성 헬퍼
 */
export function createErrorResponse(
  code: ErrorCode,
  details?: any
): ErrorResponse {
  return {
    success: false,
    error: {
      code,
      message: ERROR_MESSAGES[code],
      details,
      timestamp: new Date().toISOString()
    }
  }
}
```

**사용 예시:**
```typescript
// Server Action에서
if (!sr) {
  return createErrorResponse(ErrorCode.SR_NOT_FOUND, { srId })
}

if (!canTransition(sr.status, newStatus)) {
  return createErrorResponse(ErrorCode.INVALID_STATE_TRANSITION, {
    currentStatus: sr.status,
    targetStatus: newStatus
  })
}
```

---

## 시스템 아키텍처

### 기술 스택

**Backend & Database**
- 프레임워크: Next.js 14 App Router (TypeScript)
  - Server Actions (API 엔드포인트)
  - Route Handlers (REST API)
  - Serverless Functions
- 데이터베이스: **Supabase PostgreSQL** (기본 DB 기능만 사용)
  - Supabase 프로젝트의 PostgreSQL 인스턴스 활용
  - Connection Pooling: Supabase 내장 Connection Pooler (PgBouncer)
  - 직접 연결: `postgresql://[user]:[password]@db.[project].supabase.co:5432/postgres`
  - 풀링 연결: `postgresql://[user]:[password]@db.[project].supabase.co:6543/postgres`
  - **주의**: Supabase Auth, Storage, Realtime 기능은 사용하지 않음
- ORM: Prisma
  - 타입 안전성
  - 마이그레이션 관리
  - Prisma Studio (데이터 관리)
  - Supabase PostgreSQL 직접 연결
- 인증: NextAuth.js v5 (Auth.js)
  - JWT + Database Session (Prisma Adapter)
  - 이메일 인증 (자체 구현)
  - Supabase Auth 미사용

**Frontend**
- 프레임워크: Next.js 14 (React 18+)
  - Server Components (SSR 최적화)
  - Client Components (인터랙티브 UI)
  - App Router
  - TypeScript
- UI 라이브러리: Shadcn/ui + Tailwind CSS
  - Radix UI 기반 (WCAG 2.1 접근성 준수)
  - Dark mode 지원
  - 완전한 커스터마이징
- 상태 관리:
  - TanStack Query (React Query) - 서버 상태
  - Zustand - 클라이언트 상태
- 폼 관리: React Hook Form + Zod (유효성 검증)
- 테이블/차트:
  - TanStack Table (고성능 테이블)
  - Recharts (통계 차트)

**Infrastructure & Deployment**
- 호스팅: Vercel
  - 자동 CI/CD (GitHub 연동)
  - Preview Deployments
  - Edge Network (Global CDN)
  - 무료 SSL
  - 환경 변수 관리
- 파일 스토리지:
  - **Supabase Storage** (Supabase의 S3 호환 스토리지)
  - REST API를 통한 직접 업로드/다운로드
  - 공개/비공개 버킷 관리
  - 또는 Vercel Blob Storage / AWS S3
- 캐시 & 세션: Upstash Redis (Serverless)
  - Rate Limiting
  - API 응답 캐싱
  - 세션 저장

**알림 & 백그라운드 작업**
- 이메일: Resend + React Email
  - TypeScript 지원
  - JSX 템플릿
  - 발송 로그 추적
- Mattermost: Webhook / API 직접 통합
- 작업 스케줄링: Inngest
  - Vercel 통합
  - 재시도 로직 내장
  - 크론 작업 지원

**모니터링 & 로깅**
- 에러 추적: Sentry (Vercel 공식 통합)
- 로깅: Axiom (Vercel 통합)
- APM: Vercel Speed Insights
- Analytics: Vercel Web Analytics
- Uptime: BetterUptime

**개발 도구**
- 언어: TypeScript
- 패키지 매니저: pnpm
- 린터: ESLint + Prettier
- Pre-commit: Husky + lint-staged
- 테스팅:
  - Vitest (유닛 테스트)
  - Playwright (E2E 테스트)
  - React Testing Library (컴포넌트 테스트)

### 시스템 구성도

```
┌─────────────────────────────────────────┐
│      사용자 (Browser/Mobile)            │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│    Vercel Edge Network (Global CDN)     │
│    - Static Assets Cache               │
│    - Image Optimization                 │
│    - Edge Functions                     │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│    Next.js 14 App (Vercel Functions)    │
│    - Server Components                  │
│    - Server Actions (API)               │
│    - Route Handlers                     │
│    - NextAuth Middleware                │
│    - Prisma ORM                         │
└─────┬───────────────────┬───────────────┘
      │                   │
      ↓                   ↓
┌──────────────┐   ┌─────────────────────┐
│  Supabase    │   │  External Services  │
│  PostgreSQL  │   │                     │
│              │   │  ├─ Upstash Redis   │
│ + Connection │   │  │   (Cache/Session)│
│   Pooler     │   │  │                  │
│ (PgBouncer)  │   │  ├─ Supabase Storage│
│              │   │  │   (File Storage) │
│              │   │  │                  │
└──────────────┘   │  ├─ Resend          │
                   │  │   (Email)        │
                   │  │                  │
                   │  ├─ Inngest         │
                   │  │   (Background    │
                   │  │    Jobs & Cron)  │
                   │  │                  │
                   │  ├─ Mattermost API  │
                   │  │   (Notifications)│
                   │  │                  │
                   │  ├─ Sentry          │
                   │  │   (Error Track)  │
                   │  │                  │
                   │  └─ Axiom           │
                   │      (Logging)      │
                   └─────────────────────┘
```

### 애플리케이션 구조

```
Next.js App Router 기반 모놀리식 구조
├── Authentication Layer (NextAuth.js)
├── Server Actions (API Logic)
│   ├── User Management
│   ├── Client Management
│   ├── SR Management
│   ├── Permission Control
│   └── Analytics & Reports
├── Background Jobs (Inngest)
│   ├── Email Notifications
│   ├── Mattermost Notifications
│   ├── Scheduled Reports
│   └── Data Cleanup
├── Storage Layer (Supabase Storage API)
│   ├── File Upload/Download
│   ├── Bucket Management
│   └── Access Control
└── Database Layer (Prisma)
    └── Supabase PostgreSQL
```

### Supabase 사용 방식 (중요)

**사용하는 기능:**
- ✅ **PostgreSQL Database**: Prisma ORM을 통한 직접 연결
  - Connection String 방식으로 연결
  - Supabase의 Connection Pooler (PgBouncer) 활용
  - 일반적인 PostgreSQL DB처럼 사용
- ✅ **Supabase Storage**: REST API를 통한 파일 저장소
  - 파일 업로드/다운로드 API
  - 버킷(Bucket) 단위 관리
  - 공개/비공개 파일 관리

**사용하지 않는 기능:**
- ❌ Supabase Auth (NextAuth.js 사용)
- ❌ Supabase Realtime (React Query로 폴링 방식 사용)
- ❌ Supabase Edge Functions (Vercel Functions 사용)
- ❌ Supabase Client SDK의 자동 인증 통합
- ❌ Row Level Security (RLS) - 애플리케이션 레벨에서 권한 관리

**Prisma 설정 예시:**

```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  directUrl = env("DIRECT_URL") // 마이그레이션용
}

// .env.local
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres"
```

**Supabase Storage 사용 예시:**

```typescript
// lib/storage.ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // 서버사이드에서만 사용
)

// 파일 업로드
export async function uploadFile(bucket: string, path: string, file: File) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file)

  return { data, error }
}

// 파일 다운로드 URL
export function getFileUrl(bucket: string, path: string) {
  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(path)

  return data.publicUrl
}
```

### 폴더 구조

```
sr-management/
├── prisma/
│   ├── schema.prisma          # 데이터베이스 스키마
│   ├── migrations/            # 마이그레이션 파일
│   └── seed.ts                # 초기 데이터
├── src/
│   ├── app/                   # Next.js App Router
│   │   ├── (auth)/           # 인증 관련 페이지
│   │   │   ├── login/
│   │   │   └── register/
│   │   ├── (dashboard)/      # 대시보드 (인증 필요)
│   │   │   ├── dashboard/
│   │   │   ├── sr/           # SR 관리
│   │   │   ├── clients/      # 고객사 관리
│   │   │   ├── users/        # 사용자 관리
│   │   │   └── reports/      # 보고서
│   │   ├── api/              # API Routes
│   │   │   ├── auth/[...nextauth]/
│   │   │   ├── inngest/      # Inngest webhook
│   │   │   └── webhooks/
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/               # Shadcn UI components
│   │   ├── forms/            # 폼 컴포넌트
│   │   ├── tables/           # 테이블 컴포넌트
│   │   ├── charts/           # 차트 컴포넌트
│   │   └── layouts/          # 레이아웃 컴포넌트
│   ├── lib/
│   │   ├── db.ts             # Prisma client (Supabase PostgreSQL)
│   │   ├── auth.ts           # NextAuth config
│   │   ├── redis.ts          # Upstash Redis
│   │   ├── storage.ts        # Supabase Storage client
│   │   └── utils.ts
│   ├── server/
│   │   ├── actions/          # Server Actions
│   │   │   ├── auth.ts
│   │   │   ├── sr.ts
│   │   │   ├── client.ts
│   │   │   └── user.ts
│   │   ├── services/         # 비즈니스 로직
│   │   │   ├── sr-service.ts
│   │   │   ├── notification-service.ts
│   │   │   └── permission-service.ts
│   │   └── email/            # 이메일 관련
│   │       ├── templates/    # React Email templates
│   │       └── send.ts
│   ├── inngest/              # Inngest functions
│   │   ├── client.ts
│   │   └── functions/
│   │       ├── send-email.ts
│   │       ├── send-mattermost.ts
│   │       └── generate-reports.ts
│   └── types/
│       ├── index.ts
│       └── prisma.ts
├── public/
│   ├── images/
│   └── fonts/
├── emails/                   # React Email templates
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── .env.local
├── .env.example
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 데이터 모델
### ERD 및 DDL 등
- DB.md 참조
---

## 보안 및 권한

### 인증 (Authentication)

#### 1. 로그인 프로세스
- 이메일 + 비밀번호 기반 로그인
- JWT 토큰 발급 (유효 기간: 1시간)
- Refresh Token (유효 기간: 7일)
- 동시 로그인 제한: 5개 세션 이내
- 로그인 시도 실패 3회 이상 시 계정 일시 잠금 (15분)

#### 2. 비밀번호 정책
- 최소 8자 이상
- 대문자, 소문자, 숫자, 특수문자 포함 필수
- 비밀번호 만료 정책: 90일
- 이전 비밀번호 5개 재사용 불가
- 비밀번호 변경 시 확인 메일 발송

#### 3. 이메일 인증
- 회원가입 시 이메일 인증 필수
- 인증 링크 유효 기간: 24시간
- 인증 링크 1회 사용 후 만료
- 재인증 요청 가능 (최대 3회/1일)

#### 4. 2단계 인증 (옵션)
- TOTP (Time-based One-Time Password) 지원
- SMS OTP 지원
- 관리자가 특정 사용자에게 강제 설정 가능

### 접근 제어 (Authorization)

#### 1. 역할 기반 접근 제어 (RBAC)
- 사용자 역할에 따른 기능 접근 제어
- 역할별 세분화된 권한 설정
- 고객사별 역할 지정 가능

#### 2. 데이터 접근 제어
- 고객사별 데이터 격리
- 사용자는 자신이 속한 고객사 데이터만 접근 가능 (예외: 시스템 관리자)
- 다중 고객사 소속 사용자는 각 고객사별로 권한 구분

#### 3. 권한 매트릭스

**기능별 역할 권한 표**

| 기능 | SYSTEM_ADMIN | CLIENT_ADMIN | DEVELOPER | CLIENT_USER |
|------|--------------|--------------|-----------|-------------|
| **SR 관리** |
| SR 생성 | ✅ 전체 | ✅ 본인 고객사 | ❌ | ✅ 본인 고객사 |
| SR 조회 | ✅ 전체 | ✅ 본인 고객사 | ✅ 할당된 SR | ✅ 본인 SR |
| SR 수정 | ✅ 전체 | ✅ 본인 고객사 | ✅ 할당된 SR | ❌ |
| SR 삭제 | ✅ 전체 | ❌ | ❌ | ❌ |
| SR 상태 변경 | ✅ 전체 | ✅ 본인 고객사 | ✅ 할당된 SR | ❌ |
| SR 담당자 배정 | ✅ 전체 | ✅ 본인 고객사 | ❌ | ❌ |
| SR 댓글 작성 | ✅ 전체 | ✅ 본인 고객사 | ✅ 할당된 SR | ✅ 본인 SR |
| SR 내부 노트 | ✅ 전체 | ❌ | ✅ 할당된 SR | ❌ |
| SR 첨부파일 관리 | ✅ 전체 | ✅ 본인 고객사 | ✅ 할당된 SR | ✅ 본인 SR |
| **고객사 관리** |
| 고객사 생성 | ✅ | ❌ | ❌ | ❌ |
| 고객사 조회 | ✅ 전체 | ✅ 본인 고객사 | ✅ 관련 고객사 | ✅ 본인 고객사 |
| 고객사 수정 | ✅ 전체 | ✅ 본인 고객사 | ❌ | ❌ |
| 고객사 삭제 | ✅ | ❌ | ❌ | ❌ |
| **사용자 관리** |
| 사용자 생성 | ✅ 전체 | ✅ 본인 고객사 | ❌ | ❌ |
| 사용자 조회 | ✅ 전체 | ✅ 본인 고객사 | ✅ 본인 | ✅ 본인 |
| 사용자 수정 | ✅ 전체 | ✅ 본인 고객사 | ✅ 본인 | ✅ 본인 |
| 사용자 삭제 | ✅ 전체 | ❌ | ❌ | ❌ |
| 역할 변경 | ✅ | ❌ | ❌ | ❌ |
| **서비스 카테고리** |
| 카테고리 생성 | ✅ | ✅ 본인 고객사 | ❌ | ❌ |
| 카테고리 조회 | ✅ 전체 | ✅ 본인 고객사 | ✅ 관련 고객사 | ✅ 본인 고객사 |
| 카테고리 수정 | ✅ | ✅ 본인 고객사 | ❌ | ❌ |
| 카테고리 삭제 | ✅ | ✅ 본인 고객사 | ❌ | ❌ |
| **보고서** |
| 보고서 조회 | ✅ 전체 | ✅ 본인 고객사 | ❌ | ✅ 본인 고객사 |
| 보고서 내보내기 | ✅ | ✅ 본인 고객사 | ❌ | ❌ |
| **시스템** |
| 시스템 설정 | ✅ | ❌ | ❌ | ❌ |
| 감사 로그 조회 | ✅ | ❌ | ❌ | ❌ |

**권한 체크 로직**

1. **SYSTEM_ADMIN**: 모든 리소스에 대한 전체 권한
2. **CLIENT_ADMIN**: 본인 고객사 내 모든 권한 (삭제 제외)
3. **DEVELOPER**: 할당된 SR 처리 권한
4. **CLIENT_USER**: SR 신청 및 본인 SR 조회 권한

**특수 권한 규칙**

- **SR 소유자**: SR을 생성한 사용자는 REQUESTED 상태에서만 수정/삭제 가능
- **SR 담당자**: 담당자로 배정된 DEVELOPER는 해당 SR의 상태 변경 및 수정 가능
- **고객사 격리**: CLIENT_ADMIN과 CLIENT_USER는 본인 고객사 데이터만 접근 가능
- **내부 노트**: DEVELOPER와 SYSTEM_ADMIN만 작성 및 조회 가능

#### 4. 감사 로깅 (Audit Logging)
- 모든 사용자 활동 기록
- 민감한 작업 (권한 변경, 삭제 등) 상세 기록
- 기록 보관 기간: 최소 1년
- 로그 조회 권한: 시스템 관리자만

### 데이터 보안

#### 1. 데이터 암호화
- 전송 중: HTTPS/TLS 사용
- 저장 시: 민감 정보 (비밀번호, 개인 정보) AES-256 암호화
- 데이터베이스: 암호화 저장소 사용

#### 2. 백업 및 복구
- 일일 자동 백업 (최소 30일 보관)
- 이중 백업 (로컬 + 원격)
- 정기적 복구 테스트
- RPO (Recovery Point Objective): 1일 이내
- RTO (Recovery Time Objective): 4시간 이내

#### 3. 접근 기록 (Access Logging)
- 모든 API 요청 기록
- 로그인/로그아웃 시간 기록
- 권한 변경 기록
- 민감 정보 접근 기록

---

## 알림 시스템

### 알림 프로세스

#### 1. 알림 생성
```
이벤트 발생 → 알림 생성 → 알림 큐 저장 → 
알림 워커 처리 → 채널별 발송 (이메일/매터모스트)
```

#### 2. 알림 전달 흐름
```
Backend 이벤트 → Celery Task 생성 → 
알림 서비스 처리 → SMTP/Mattermost API 호출 → 
사용자 수신 → 사용자 확인 (선택)
```

### 알림 타입별 설정

| 알림 타입 | 트리거 | 수신자 | 채널 | 즉시성 |
|---------|--------|--------|------|--------|
| SR 신청 | SR 등록 | 담당자 | 이메일 + MM | 즉시 |
| SR 접수 | SR 상태 접수 | 신청자 | 이메일 | 즉시 |
| SR 완료 | SR 상태 완료 | 신청자 | 이메일 | 즉시 |
| SR 거절 | SR 상태 거절 | 신청자 | 이메일 | 즉시 |
| SR 보류 | SR 상태 보류 | 신청자/담당자 | 이메일 | 즉시 |
| 담당자 배정 | 담당자 변경 | 새 담당자 | 이메일 + MM | 즉시 |
| 미처리 경고 | SLA 초과 시작 | 담당자 | 이메일 + MM | 1시간마다 |
| 계약 종료 알림 | 계약 30일전 | 고객사 관리자 | 이메일 | 1회 |

### 알림 신뢰성

#### 1. 재시도 정책
- 1차 시도: 즉시
- 2차 시도: 1분 후
- 3차 시도: 5분 후
- 4차 시도: 30분 후
- 실패 시 관리자 알림

#### 2. 모니터링
- 알림 발송 성공률 추적
- 알림 지연 시간 모니터링
- 장시간 미처리 알림 감지

#### 3. 데이터 저장
- 모든 알림 발송 기록 저장
- 발송 시간, 채널, 상태 기록
- 사용자 확인 여부 추적

---

## UI/UX 요구사항

### 1. 대시보드 (Dashboard)

**관리자 대시보드:**
- 전체 SR 현황 (신청, 접수, 진행중, 완료)
- 고객사별 SR 현황
- 담당자별 처리 현황
- 일일/주간/월간 통계 그래프
- 미처리 SR 목록 (우선순위순)
- 최근 활동 피드

**담당자 대시보드:**
- 본인에게 할당된 SR 목록
- SR 상태별 현황 (모두 몇 개, 접수 몇 개, 진행중 몇 개 등)
- 오늘의 할 일 (예정된 완료 날짜)
- 평균 처리 시간


**고객사 대시보드:**
- 본사에서 신청한 SR 목록
- SR 상태별 현황
- 처리 중인 SR 현황
- 완료된 SR 목록
- 평균 처리 시간
- 자사 담당자 정보

### 2. SR 목록 화면

**필터링 기능:**
- 상태별 (신청, 접수, 진행중, 완료, 거절, 보류)
- 우선순위별 (긴급, 높음, 중간, 낮음)
- 고객사별 (본인 고객사만 또는 관리자는 모두)
- 담당자별
- 날짜 범위별
- 검색어 (SR ID, 제목 등)

**컬럼:**
- SR ID
- 제목
- 고객사명
- 상태 (배지 색상)
- 우선순위 (아이콘)
- 신청일
- 예상 완료
- 담당자
- 액션 버튼 (상세보기, 수정, 댓글, 첨부)

**정렬:**
- 기본: 신청일 역순
- 선택 가능: 상태, 우선순위, 예상 완료 등

### 3. SR 상세 화면

**정보 표시:**
```
┌─────────────────────────────────────┐
│  SR#001 - 로그인 오류 발생           │
├─────────────────────────────────────┤
│ 상태: [진행중] | 우선순위: [높음]    │
│ 고객사: ABC Company | 신청자: 김철수 │
│ 담당자: 이영희 | 신청일: 2025-11-06 │
│ 예상 완료: 2025-11-07 | 실제 완료: - │
├─────────────────────────────────────┤
│ [상세 설명]                         │
│ 사용자들이 시스템에 로그인할 수 없는 │
│ 문제가 발생했습니다...              │
├─────────────────────────────────────┤
│ [첨부파일]                          │
│ - error_log.txt (2.5MB)            │
│ - screenshot.png (500KB)           │
├─────────────────────────────────────┤
│ [댓글 및 기록]                      │
│ 2025-11-06 10:00 | 이영희 (담당자)  │
│ 현재 원인을 파악 중입니다.          │
│ (내부 노트)                        │
└─────────────────────────────────────┘
```

**액션 버튼:**
- 상태 변경 (드롭다운)
- 담당자 변경
- 우선순위 변경
- 댓글 작성
- 첨부파일 추가
- 인쇄
- 공유

### 4. SR 등록 화면

**단계별 입력:**
1. 기본 정보
   - 고객사 선택 (자동 선택 또는 변경)
   - 제목 입력 (필수)
   - 상세 설명 (필수, Rich Text Editor)

2. 카테고리 및 우선순위
   - 서비스 카테고리 선택 (필수)
   - 우선순위 선택 (선택, 기본: 중)
   - 희망 완료 날짜 선택 (선택)

3. 첨부파일 (선택)
   - Drag & Drop 또는 클릭으로 파일 선택
   - 미리보기
   - 삭제

4. 검토 및 제출
   - 입력 내용 검토
   - 제출 버튼 클릭
   - 제출 완료 메시지

### 5. 사용자 관리 화면

**사용자 목록:**
- 사용자명, 이메일, 연락처, 상태, 고객사, 역할 표시
- 필터: 상태별, 고객사별, 역할별
- 정렬: 이름, 가입일 등

**사용자 상세:**
- 프로필 정보 표시
- 고객사별 역할 표시
- 로그인 이력
- 권한 목록
- 수정 버튼 (관리자만)

**사용자 추가/수정:**
- 기본 정보 입력
- 고객사 및 역할 선택
- 저장 버튼

### 6. 고객사 관리 화면

**고객사 목록:**
- 고객사명, 코드, 담당자, 상태 표시
- 필터: 상태별, 지역별
- 검색: 고객사명, 코드

**고객사 상세:**
- 기본 정보
- 담당자 목록
- 서비스 카테고리
- 계약 정보
- SR 통계

**고객사 추가/수정:**
- 기본 정보 입력
- 담당자 배정
- 서비스 카테고리 설정
- 저장 버튼

### 7. 반응형 디자인

**디바이스 대응:**
- 데스크톱 (1920px 이상)
- 태블릿 (768px ~ 1024px)
- 모바일 (480px ~ 767px)

**모바일 최적화:**
- 터치 친화적 버튼 크기
- 모바일용 네비게이션 (헤더 메뉴)
- 간단한 필터링
- 스와이프 네비게이션

### 8. 접근성 (Accessibility)

- WCAG 2.1 AA 기준 준수
- 키보드 네비게이션 지원
- 스크린 리더 호환
- 적절한 색상 대비
- Alt 텍스트 제공
- 폼 레이블 명확성

---

## 성능 요구사항

### 1. 응답 시간

| 기능 | 목표 응답 시간 |
|------|----------------|
| 페이지 로드 | < 2초 |
| API 응답 | < 500ms |
| 검색 결과 | < 1초 |
| 이미지 로드 | < 1초 |
| 대시보드 로드 | < 3초 |

### 2. 동시 사용자

- 예상 동시 사용자: 1,000명
- 피크 시간 예상: 업무 시간 (09:00 ~ 18:00)
- 부하 분산: 로드 밸런서 사용

### 3. 처리량

- 일일 SR 신청: 10,000건 예상
- 일일 API 요청: 1,000,000건 예상
- 초당 처리량: 20,000 요청/초

### 4. 가용성

- 목표 가용성: 99.9% (연간 다운타임 < 8.76시간)
- SLA: 99.5% 이상 목표

### 5. 저장 공간

- 초기 데이터: ~100GB 예상
- 연간 증가율: ~50% 예상
- 3년 후 필요 용량: ~300GB

### 6. 캐싱 전략

- 정적 컨텐츠: Vercel Edge CDN 캐싱 (자동)
- 이미지: Next.js Image Optimization + CDN
- API 응답: Upstash Redis 캐싱 (1시간)
- 사용자 세션: Database 또는 Redis (7일)
- 고객사 정보: React Query 캐싱 + Redis (1일)
- Server Components: Next.js 자동 캐싱

### 7. Vercel Serverless 제약사항 고려

**함수 실행 시간:**
- Hobby 플랜: 10초 제한
- Pro 플랜: 60초 제한
- Edge Functions: 30초 제한

**대응 방안:**
- 대용량 파일 처리: 클라이언트 직접 업로드 (Vercel Blob Storage)
- 장시간 작업: Inngest로 백그라운드 처리
- 이메일 발송: 비동기 큐 처리 (Inngest)
- 보고서 생성: 스트리밍 응답 또는 백그라운드 작업

**Connection Pooling:**
- Prisma Data Proxy 또는 Neon의 내장 풀링 사용
- 최대 연결 수 제한 고려

---

## 마이그레이션 및 운영

### 1. 시스템 구현 단계

**Phase 1: 기초 구축 (1~2개월)**
- Next.js 프로젝트 초기 설정
- Supabase 프로젝트 생성 및 설정
- Prisma 스키마 설계 (Supabase PostgreSQL 연결)
- Prisma 마이그레이션 설정 및 실행
- NextAuth.js 인증 시스템 구축 (Prisma Adapter)
- Supabase Storage 버킷 설정 (파일 업로드용)
- 기본 사용자/고객사 관리 기능 개발
- 권한 관리 시스템 개발 (RBAC)
- Shadcn/ui 기반 UI 컴포넌트 구축
- Vercel 배포 파이프라인 구축

**Phase 2: SR 관리 핵심 (2~3개월)**
- SR 신청/접수/처리 Server Actions 개발
- SR 상태 관리 시스템 개발
- 댓글 및 첨부파일 관리 (Supabase Storage)
  - 파일 업로드 API 구현
  - 공개/비공개 버킷 관리
  - 파일 접근 권한 제어
- TanStack Table 기반 SR 목록 개발
- 대시보드 개발 (Recharts)
- React Query로 실시간 데이터 동기화

**Phase 3: 알림 시스템 (1개월)**
- Resend + React Email 템플릿 구축
- Inngest 백그라운드 작업 설정
- 이메일 알림 자동화
- 매터모스트 Webhook 통합
- 알림 발송 기록 및 재시도 로직

**Phase 4: 분석 및 보고 (1개월)**
- Prisma Aggregation으로 통계 기능 개발
- PDF 보고서 생성 (@react-pdf/renderer)
- Excel export 기능 (xlsx)
- 대시보드 차트 고도화
- 캐싱 최적화 (React Query + Redis)

**Phase 5: 보안 및 최적화 (1개월)**
- NextAuth.js 보안 강화 (2FA, Rate Limiting)
- Sentry 에러 모니터링 통합
- Lighthouse 성능 최적화
- E2E 테스트 작성 (Playwright)
- 보안 감사 (OWASP 체크리스트)

**Phase 6: 배포 및 운영 (진행 중)**
- Preview 환경 테스트 (Vercel Preview Deployments)
- Production 환경 설정 및 환경 변수 구성
- 데이터 마이그레이션 (Prisma Migrate)
- Vercel Production 배포
- 모니터링 대시보드 설정 (Sentry, Axiom)
- 성능 모니터링 및 최적화

### 2. 데이터 마이그레이션

**마이그레이션 대상:**
- 기존 고객사 정보
- 기존 사용자 정보
- 기존 SR 정보 (있을 경우)

**마이그레이션 전략 (Prisma 기반):**
1. Prisma 스키마 설계 및 검증
2. 마이그레이션 스크립트 작성 (TypeScript)
3. Preview 환경에서 테스트 마이그레이션
4. 데이터 검증 및 무결성 체크
5. Production 마이그레이션 실행 (`prisma migrate deploy`)
6. 사후 검증 및 롤백 준비

**롤백 계획:**
- PostgreSQL 스냅샷 백업 (마이그레이션 전)
- Prisma 마이그레이션 롤백 가능 (`prisma migrate resolve`)
- Vercel Deployment Rollback 기능 활용

### 3. 운영 계획

**모니터링 (Vercel + Sentry + Axiom):**
- Vercel Analytics: 실시간 성능 모니터링
- Sentry: 에러 추적 및 알림 (24/7)
- Axiom: 로그 수집 및 분석
- Vercel Functions: Serverless 함수 실행 시간 모니터링
- PostgreSQL: 쿼리 성능 및 연결 수 모니터링
- BetterUptime: 가동률 모니터링 및 알림

**백업 (Supabase):**
- Supabase PostgreSQL:
  - Free tier: 자동 일일 백업 (7일 보관)
  - Pro tier: Point-in-time Recovery (7일)
  - Team tier: Point-in-time Recovery (30일)
- Supabase Storage: 파일 버전 관리 (선택 활성화)
- 수동 백업:
  - 주간 전체 데이터베이스 덤프 (`pg_dump`)
  - 오프라인 백업 파일 보관 (AWS S3 등)

**정기 유지보수:**
- 주간: 의존성 보안 업데이트 (Dependabot)
- 월간: Next.js/Prisma 버전 업데이트
- 분기별: Lighthouse 성능 감사 및 최적화
- 반기별: 보안 감사 (OWASP 체크리스트)

**지원 체계:**
- GitHub Issues: 버그 추적 및 기능 요청
- 사용자 가이드: Next.js 기반 문서 사이트
- 장애 대응: Vercel Status Page 활용
- 커뮤니티: 사용자 피드백 채널

### 4. 배포 환경 및 예상 비용

#### 4.1 추천 호스팅 옵션 (규모별)

**소규모/MVP (무료~월 $25)**

```
├─ Vercel: Hobby Plan (무료)
│  └─ 제한: 100GB 대역폭, 6,000분 빌드 시간
├─ Supabase: Free tier (무료)
│  ├─ PostgreSQL: 500MB 데이터베이스
│  ├─ Storage: 1GB 파일 저장
│  ├─ Bandwidth: 5GB/월
│  └─ Connection Pooler 포함
├─ Upstash Redis: Free tier (무료)
│  └─ 제한: 10K commands/day, 256MB
├─ Resend: Free tier (무료)
│  └─ 제한: 3,000 emails/month
└─ Inngest: Free tier (무료)
   └─ 제한: 50K steps/month

예상 월 비용: $0 (무료 티어 활용)
적합 규모: 사용자 100명 이하, SR 1,000건/월
```

#### 4.2 환경별 설정

**Development (로컬)**

```bash
- PostgreSQL:
  - 옵션 1: Supabase 개발 프로젝트 (무료)
  - 옵션 2: Docker 컨테이너 (로컬 PostgreSQL)
- Storage: Supabase Storage 개발 버킷
- Redis: Docker 컨테이너 (선택) 또는 Upstash Free
- 이메일: 콘솔 로그 출력 (실제 발송 안 함)
- Inngest: Dev Server
```

**Preview (Vercel Preview Deployments)**

```bash
- PostgreSQL: Supabase Preview/Staging 프로젝트
- Storage: Supabase Storage (Staging 버킷)
- Redis: Upstash (개발 인스턴스)
- 이메일: Resend Test 환경
- Inngest: Dev/Staging 환경
- 도메인: auto-generated-preview-url.vercel.app
```

**Production (Vercel Production)**

```bash
- PostgreSQL: Supabase Production 프로젝트
  - Connection String: postgresql://[user]:[password]@db.[project].supabase.co:6543/postgres
  - Pooling Mode: Transaction (Serverless 환경 최적화)
- Storage: Supabase Storage (Production 버킷)
- Redis: Upstash Production
- 이메일: Resend Production
- Inngest: Production 환경
- 도메인: 커스텀 도메인 (sr.yourdomain.com)
- 모니터링: Sentry + Axiom
- 백업: Supabase 자동 백업 + 수동 백업
```

#### 4.3 CI/CD 파이프라인

```
GitHub Push → Vercel 자동 감지
    ↓
빌드 시작 (Next.js build)
    ↓
타입 체크 (TypeScript)
    ↓
린트 검사 (ESLint)
    ↓
유닛 테스트 (Vitest)
    ↓
빌드 완료
    ↓
Preview/Production 배포
    ↓
Sentry Source Maps 업로드
    ↓
배포 완료 알림 (Slack/Email)
```

### 5. 추가 개발 로드맵 (우선순위)

**Near-term (3~6개월)**

1. 모바일 반응형 최적화 (PWA)
2. 고급 검색 필터 및 저장된 필터
3. 자동화 규칙 엔진 (Inngest Workflows)
4. Slack 통합 (매터모스트 외)
5. 다크 모드 완전 지원

**Mid-term (6~12개월)**

1. AI 챗봇 통합 (SR 자동 분류 - Vercel AI SDK)
2. 워크플로우 커스터마이징 (drag-and-drop)
3. 고급 분석 대시보드 (예측 분석)
4. 공개 API 및 개발자 포털
5. 모바일 네이티브 앱 (React Native)

**Long-term (1년 이상)**

1. 머신러닝 기반 예측 분석 (Vercel AI)
2. 음성 지원 (SR 음성 신청 - Web Speech API)
3. 다국어 지원 (i18n)
4. 고급 권한 관리 (ABAC)
5. 온프레미스 배포 옵션

---

## 부록

### A. 약어 및 용어

| 약어 | 뜻 | 설명 |
|------|-----|------|
| SR | Service Request | 서비스 요청 |
| SLA | Service Level Agreement | 서비스 수준 약정 |
| RBAC | Role-Based Access Control | 역할 기반 접근 제어 |
| JWT | JSON Web Token | JSON 웹 토큰 |
| TOTP | Time-based One-Time Password | 시간 기반 일회용 비밀번호 |
| API | Application Programming Interface | 응용 프로그래밍 인터페이스 |
| SMTP | Simple Mail Transfer Protocol | 간단한 메일 전송 프로토콜 |
| RPO | Recovery Point Objective | 복구 지점 목표 |
| RTO | Recovery Time Objective | 복구 시간 목표 |
| SSR | Server-Side Rendering | 서버 사이드 렌더링 |
| ORM | Object-Relational Mapping | 객체 관계 매핑 |
| CDN | Content Delivery Network | 콘텐츠 전송 네트워크 |
| PWA | Progressive Web App | 프로그레시브 웹 앱 |

### B. 기술 스택 관련 문서

**공식 문서:**
- Next.js: https://nextjs.org/docs
- Prisma: https://www.prisma.io/docs
- Supabase: https://supabase.com/docs
  - PostgreSQL: https://supabase.com/docs/guides/database
  - Storage: https://supabase.com/docs/guides/storage
  - Connection Pooler: https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler
- NextAuth.js: https://next-auth.js.org
- Shadcn/ui: https://ui.shadcn.com
- TanStack Query: https://tanstack.com/query
- Vercel: https://vercel.com/docs

**추가 참고 문서:**
- Database Design Document (Prisma Schema + Supabase PostgreSQL)
- Security & Compliance Document
- API Specification Document (Server Actions)
- Supabase Storage Integration Guide
- UI/UX Design Specification (Shadcn Components)
- Testing Plan & Test Cases (Vitest, Playwright)
- Deployment Guide (Vercel + Supabase)

---

**문서 버전 관리:**

| 버전 | 작성자 | 변경 사항 | 작성일 |
|------|--------|-----------|--------|
| 1.0 | Product Team | 초안 작성 | 2025-11-06 |
| 1.1 | Product Team | 기술 스택 업데이트 (Next.js + Vercel + PostgreSQL) | 2025-11-06 |
| 1.2 | Product Team | 데이터베이스를 Supabase PostgreSQL로 변경 (기본 DB 기능만 사용) | 2025-11-06 |

---

*이 문서는 SR 관리 시스템의 상세 요구사항을 정의하는 핵심 문서입니다. 프로젝트 진행 중 변경 사항이 발생할 경우 관련 담당자와 협의하여 업데이트합니다.*
