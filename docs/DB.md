# SR Management System - Database Design Document

**문서 종류:** DB
**문서 버전:** 1.3
**작성일:** 2025-11-06
**최종 수정일:** 2025-01-12
**작성자:** Development Team
**검수자:** [검수자 정보]

---

## ⚠️ 중요 안내

**본 문서는 Prisma 스키마 및 데이터베이스 구조의 유일한 정의 문서(Single Source of Truth)입니다.**

다른 문서(PRD, TRD, LLD)에서 데이터베이스 관련 내용이 필요한 경우 본 문서를 참조하세요.

---

## 📚 문서 간 참조 가이드

| 문서                                      | 역할              | 주요 내용                              |
| ----------------------------------------- | ----------------- | -------------------------------------- |
| **[PRD.md](SR_Management_System_PRD.md)** | 비즈니스 요구사항 | 기능 정의, 사용자 역할, SR 프로세스    |
| **[DB.md](DB.md)**                        | 데이터베이스 설계 | **Prisma 스키마, ERD, 테이블 명세** ⭐ |
| **[TRD.md](TRD.md)**                      | 기술 명세         | 아키텍처, 기술 스택, 배포 전략         |
| **[LLD.md](LLD.md)**                      | 구현 상세         | 코드, 컴포넌트, 테스트 전략            |

**권장 읽는 순서**: PRD → DB → TRD → LLD

---

## 문서 개정 이력

| 버전 | 작성자           | 변경 사항                                                             | 작성일     | 검수자   |
| ---- | ---------------- | --------------------------------------------------------------------- | ---------- | -------- |
| 1.0  | Development Team | DB 설계 초안 작성                                                     | 2025-11-06 | [검수자] |
| 1.1  | Development Team | ENUM 정의 통합, 필드명 표준화, 상태 전이 정의 추가                    | 2025-11-06 | [검수자] |
| 1.2  | Development Team | Single Source of Truth 명시, 문서 간 참조 가이드 추가                 | 2025-11-07 | [검수자] |
| 1.3  | Development Team | SR 요청/접수 프로세스 분리를 위한 필드 추가 (요청자/접수자 역할 분리) | 2025-01-12 | [검수자] |

---

## 목차

1. [개요](#개요)
2. [데이터베이스 설계 원칙](#데이터베이스-설계-원칙)
3. [ERD (Entity Relationship Diagram)](#erd-entity-relationship-diagram)
4. [ENUM 정의](#enum-정의)
5. [테이블 명세](#테이블-명세)
6. [DDL (Data Definition Language)](#ddl-data-definition-language)
7. [인덱스 전략](#인덱스-전략)
8. [제약 조건](#제약-조건)
9. [보안 고려사항](#보안-고려사항)
10. [성능 고려사항](#성능-고려사항)
11. [초기 데이터](#초기-데이터)
12. [마이그레이션 가이드](#마이그레이션-가이드)

---

## 개요

### 데이터베이스 정보

- **DBMS:** PostgreSQL 15+ (Supabase)
- **Connection Pooler:** PgBouncer (Supabase 내장)
- **Character Set:** UTF-8
- **Timezone:** UTC
- **ORM:** Prisma

### 연결 정보

```bash
# Connection Pooler (Serverless 환경)
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:6543/postgres?pgbouncer=true&connection_limit=1"

# Direct Connection (마이그레이션용)
DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres"
```

### 데이터베이스 설계 원칙

1. **정규화:** 제3정규형(3NF) 준수
2. **명명 규칙:** snake_case (PostgreSQL 표준)
3. **타임스탬프:** 모든 주요 테이블에 created_at, updated_at 포함
4. **소프트 삭제:** 중요 데이터는 deleted_at 사용 (선택적)
5. **외래 키:** 참조 무결성 유지 (CASCADE, SET NULL)
6. **인덱스:** 자주 조회되는 컬럼에 인덱스 설정

---

## ERD (Entity Relationship Diagram)

### 전체 ERD

```mermaid
erDiagram
    User ||--o{ Account : has
    User ||--o{ Session : has
    User ||--o{ UserRole : has
    User ||--o{ UserClient : belongs_to
    User ||--o{ SR : creates
    User ||--o{ SR : assigned_to
    User ||--o{ SRActivity : performs
    User ||--o{ SRActivity : performs
    User ||--o{ SRComment : writes
    User ||--o{ PushSubscription : has
    User ||--|| NotificationPreference : has

    Role ||--o{ UserRole : assigned_to
    Role ||--o{ Permission : has

    Client ||--o{ UserClient : has
    Client ||--o{ SR : requests

    SR ||--o{ SRActivity : has
    SR ||--o{ SRComment : has
    SR ||--o{ SRAttachment : has

    User {
        string id PK
        string email UK
        string name
        string password
        datetime email_verified
        string image
        boolean is_active
        datetime created_at
        datetime updated_at
    }

    Account {
        string id PK
        string user_id FK
        string type
        string provider
        string provider_account_id
        text refresh_token
        text access_token
        int expires_at
    }

    Session {
        string id PK
        string session_token UK
        string user_id FK
        datetime expires
    }

    Role {
        string id PK
        string name UK
        string description
        datetime created_at
        datetime updated_at
    }

    UserRole {
        string id PK
        string user_id FK
        string role_id FK
        datetime created_at
    }

    Permission {
        string id PK
        string role_id FK
        string resource
        string action
    }

    Client {
        string id PK
        string name
        string industry
        string contact_person
        string contact_email
        string contact_phone
        string address
        datetime contract_start_date
        datetime contract_end_date
        boolean is_active
        datetime created_at
        datetime updated_at
    }

    UserClient {
        string id PK
        string user_id FK
        string client_id FK
        datetime created_at
    }

    SR {
        string id PK
        string sr_number UK
        string title
        text description
        enum status
        enum priority
        string client_id FK
        string requester_id FK
        string assignee_id FK
        datetime requested_at
        datetime due_date
        datetime completed_at
        datetime created_at
        datetime updated_at
    }

    SRActivity {
        string id PK
        string sr_id FK
        string user_id FK
        enum type
        text description
        json metadata
        datetime created_at
    }

    SRComment {
        string id PK
        string sr_id FK
        string user_id FK
        text content
        boolean is_internal
        datetime created_at
        datetime updated_at
    }

    SRAttachment {
        string id PK
        string sr_id FK
        string file_name
        int file_size
        string file_type
        string file_url
        string uploaded_by
        datetime created_at
    }

    Notification {
        string id PK
        enum type
        enum status
        string recipient
        string subject
        text content
        json metadata
        datetime sent_at
        string fail_reason
        datetime created_at
    }

    PushSubscription {
        string id PK
        string user_id FK
        string endpoint UK
        string p256dh
        string auth
        string user_agent
        datetime created_at
        datetime updated_at
    }

    NotificationPreference {
        string id PK
        string user_id FK
        boolean email_sr_created
        boolean email_sr_assigned
        boolean email_sr_status_changed
        boolean email_comment_added
        boolean push_sr_created
        boolean push_sr_assigned
        boolean push_sr_status_changed
        boolean push_comment_added
        datetime created_at
        datetime updated_at
    }
```

### 도메인별 ERD

#### 1. 인증 및 사용자 관리

```
┌─────────────┐
│    User     │
├─────────────┤
│ id (PK)     │───┐
│ email (UK)  │   │
│ name        │   │
│ password    │   │
│ is_active   │   │
└─────────────┘   │
                  │
       ┌──────────┼──────────┐
       │          │          │
       ▼          ▼          ▼
┌──────────┐ ┌─────────┐ ┌──────────┐
│ Account  │ │ Session │ │ UserRole │
├──────────┤ ├─────────┤ ├──────────┤
│ user_id  │ │ user_id │ │ user_id  │
│ provider │ │ token   │ │ role_id  │
└──────────┘ └─────────┘ └──────────┘
                              │
                              ▼
                         ┌─────────┐
                         │  Role   │
                         ├─────────┤
                         │ id (PK) │
                         │ name    │
                         └─────────┘
                              │
                              ▼
                      ┌──────────────┐
                      │ Permission   │
                      ├──────────────┤
                      │ role_id      │
                      │ resource     │
                      │ action       │
                      └──────────────┘
```

#### 2. SR 관리

```
┌─────────────┐
│     SR      │
├─────────────┤
│ id (PK)     │
│ sr_number   │
│ title       │
│ status      │
│ priority    │
│ client_id   │───────► Client
│ requester   │───────► User
│ assignee    │───────► User
└─────────────┘
       │
       ├──────────► SRActivity
       │
       ├──────────► SRComment
       │
       └──────────► SRAttachment
```

---

## 테이블 명세

### 1. users (사용자)

사용자 계정 정보를 저장하는 핵심 테이블

| 컬럼명         | 데이터 타입  | NULL | 기본값 | 설명                |
| -------------- | ------------ | ---- | ------ | ------------------- |
| id             | VARCHAR(30)  | NO   | cuid() | 사용자 고유 ID (PK) |
| email          | VARCHAR(255) | NO   | -      | 이메일 주소 (UK)    |
| name           | VARCHAR(100) | NO   | -      | 사용자 이름         |
| password       | VARCHAR(255) | NO   | -      | 해시된 비밀번호     |
| email_verified | TIMESTAMP    | YES  | NULL   | 이메일 인증 시간    |
| image          | TEXT         | YES  | NULL   | 프로필 이미지 URL   |
| is_active      | BOOLEAN      | NO   | true   | 활성화 상태         |
| created_at     | TIMESTAMP    | NO   | now()  | 생성 시간           |
| updated_at     | TIMESTAMP    | NO   | now()  | 수정 시간           |

**인덱스:**

- PRIMARY KEY: `id`
- UNIQUE: `email`
- INDEX: `is_active`

**제약 조건:**

- `email`: 이메일 형식 검증
- `password`: 최소 60자 (bcrypt hash)

---

### 2. accounts (외부 계정 연동)

OAuth 등 외부 인증 제공자 계정 정보

| 컬럼명              | 데이터 타입  | NULL | 기본값 | 설명                       |
| ------------------- | ------------ | ---- | ------ | -------------------------- |
| id                  | VARCHAR(30)  | NO   | cuid() | 계정 고유 ID (PK)          |
| user_id             | VARCHAR(30)  | NO   | -      | 사용자 ID (FK)             |
| type                | VARCHAR(50)  | NO   | -      | 계정 타입 (oauth, email)   |
| provider            | VARCHAR(50)  | NO   | -      | 제공자 (google, github 등) |
| provider_account_id | VARCHAR(255) | NO   | -      | 제공자의 계정 ID           |
| refresh_token       | TEXT         | YES  | NULL   | 리프레시 토큰              |
| access_token        | TEXT         | YES  | NULL   | 액세스 토큰                |
| expires_at          | INTEGER      | YES  | NULL   | 토큰 만료 시간             |
| token_type          | VARCHAR(50)  | YES  | NULL   | 토큰 타입                  |
| scope               | VARCHAR(255) | YES  | NULL   | OAuth 스코프               |
| id_token            | TEXT         | YES  | NULL   | ID 토큰                    |
| session_state       | VARCHAR(255) | YES  | NULL   | 세션 상태                  |

**인덱스:**

- PRIMARY KEY: `id`
- UNIQUE: `(provider, provider_account_id)`
- INDEX: `user_id`

**외래 키:**

- `user_id` REFERENCES `users(id)` ON DELETE CASCADE

---

### 3. sessions (세션)

사용자 세션 정보

| 컬럼명        | 데이터 타입  | NULL | 기본값 | 설명              |
| ------------- | ------------ | ---- | ------ | ----------------- |
| id            | VARCHAR(30)  | NO   | cuid() | 세션 고유 ID (PK) |
| session_token | VARCHAR(255) | NO   | -      | 세션 토큰 (UK)    |
| user_id       | VARCHAR(30)  | NO   | -      | 사용자 ID (FK)    |
| expires       | TIMESTAMP    | NO   | -      | 만료 시간         |

**인덱스:**

- PRIMARY KEY: `id`
- UNIQUE: `session_token`
- INDEX: `user_id`

**외래 키:**

- `user_id` REFERENCES `users(id)` ON DELETE CASCADE

---

### 4. verification_tokens (인증 토큰)

이메일 인증 등에 사용되는 일회성 토큰

| 컬럼명     | 데이터 타입  | NULL | 기본값 | 설명               |
| ---------- | ------------ | ---- | ------ | ------------------ |
| identifier | VARCHAR(255) | NO   | -      | 식별자 (이메일 등) |
| token      | VARCHAR(255) | NO   | -      | 인증 토큰 (UK)     |
| expires    | TIMESTAMP    | NO   | -      | 만료 시간          |

**인덱스:**

- UNIQUE: `(identifier, token)`
- UNIQUE: `token`

---

### 5. roles (역할)

사용자 역할 정의

| 컬럼명      | 데이터 타입 | NULL | 기본값 | 설명              |
| ----------- | ----------- | ---- | ------ | ----------------- |
| id          | VARCHAR(30) | NO   | cuid() | 역할 고유 ID (PK) |
| name        | VARCHAR(50) | NO   | -      | 역할 이름 (UK)    |
| description | TEXT        | YES  | NULL   | 역할 설명         |
| created_at  | TIMESTAMP   | NO   | now()  | 생성 시간         |
| updated_at  | TIMESTAMP   | NO   | now()  | 수정 시간         |

**인덱스:**

- PRIMARY KEY: `id`
- UNIQUE: `name`

**미리 정의된 역할:**

- `SYSTEM_ADMIN`: 시스템 관리자
- `CLIENT_ADMIN`: 고객사 관리자
- `DEVELOPER`: 개발자
- `CLIENT_USER`: 고객사 일반 사용자

---

### 6. user_roles (사용자-역할 매핑)

사용자와 역할의 다대다 관계

| 컬럼명     | 데이터 타입 | NULL | 기본값 | 설명              |
| ---------- | ----------- | ---- | ------ | ----------------- |
| id         | VARCHAR(30) | NO   | cuid() | 매핑 고유 ID (PK) |
| user_id    | VARCHAR(30) | NO   | -      | 사용자 ID (FK)    |
| role_id    | VARCHAR(30) | NO   | -      | 역할 ID (FK)      |
| created_at | TIMESTAMP   | NO   | now()  | 생성 시간         |

**인덱스:**

- PRIMARY KEY: `id`
- UNIQUE: `(user_id, role_id)`
- INDEX: `user_id`
- INDEX: `role_id`

**외래 키:**

- `user_id` REFERENCES `users(id)` ON DELETE CASCADE
- `role_id` REFERENCES `roles(id)` ON DELETE CASCADE

---

### 7. permissions (권한)

역할별 권한 정의

| 컬럼명   | 데이터 타입 | NULL | 기본값 | 설명                           |
| -------- | ----------- | ---- | ------ | ------------------------------ |
| id       | VARCHAR(30) | NO   | cuid() | 권한 고유 ID (PK)              |
| role_id  | VARCHAR(30) | NO   | -      | 역할 ID (FK)                   |
| resource | VARCHAR(50) | NO   | -      | 리소스 (sr, client, user 등)   |
| action   | VARCHAR(50) | NO   | -      | 액션 (create, read, update 등) |

**인덱스:**

- PRIMARY KEY: `id`
- UNIQUE: `(role_id, resource, action)`
- INDEX: `role_id`

**외래 키:**

- `role_id` REFERENCES `roles(id)` ON DELETE CASCADE

**권한 형식:** `{resource}:{action}` (예: `sr:create`, `client:read`)

---

### 8. clients (고객사)

고객사 정보

| 컬럼명              | 데이터 타입  | NULL | 기본값 | 설명                |
| ------------------- | ------------ | ---- | ------ | ------------------- |
| id                  | VARCHAR(30)  | NO   | cuid() | 고객사 고유 ID (PK) |
| name                | VARCHAR(200) | NO   | -      | 고객사 이름         |
| industry            | VARCHAR(100) | YES  | NULL   | 업종                |
| contact_person      | VARCHAR(100) | YES  | NULL   | 담당자 이름         |
| contact_email       | VARCHAR(255) | YES  | NULL   | 담당자 이메일       |
| contact_phone       | VARCHAR(20)  | YES  | NULL   | 담당자 전화번호     |
| address             | TEXT         | YES  | NULL   | 주소                |
| contract_start_date | DATE         | YES  | NULL   | 계약 시작일         |
| contract_end_date   | DATE         | YES  | NULL   | 계약 종료일         |
| is_active           | BOOLEAN      | NO   | true   | 활성화 상태         |
| created_at          | TIMESTAMP    | NO   | now()  | 생성 시간           |
| updated_at          | TIMESTAMP    | NO   | now()  | 수정 시간           |

**인덱스:**

- PRIMARY KEY: `id`
- INDEX: `name`
- INDEX: `is_active`

---

### 9. user_clients (사용자-고객사 매핑)

사용자와 고객사의 다대다 관계

| 컬럼명     | 데이터 타입 | NULL | 기본값 | 설명              |
| ---------- | ----------- | ---- | ------ | ----------------- |
| id         | VARCHAR(30) | NO   | cuid() | 매핑 고유 ID (PK) |
| user_id    | VARCHAR(30) | NO   | -      | 사용자 ID (FK)    |
| client_id  | VARCHAR(30) | NO   | -      | 고객사 ID (FK)    |
| created_at | TIMESTAMP   | NO   | now()  | 생성 시간         |

**인덱스:**

- PRIMARY KEY: `id`
- UNIQUE: `(user_id, client_id)`
- INDEX: `user_id`
- INDEX: `client_id`

**외래 키:**

- `user_id` REFERENCES `users(id)` ON DELETE CASCADE
- `client_id` REFERENCES `clients(id)` ON DELETE CASCADE

---

### 10. srs (SR - Service Request)

SR(서비스 요청) 정보

| 컬럼명                        | 데이터 타입  | NULL | 기본값      | 설명                                         |
| ----------------------------- | ------------ | ---- | ----------- | -------------------------------------------- |
| id                            | VARCHAR(30)  | NO   | cuid()      | SR 고유 ID (PK)                              |
| sr_number                     | VARCHAR(50)  | NO   | -           | SR 번호 (UK, 형식: SR-20251106-0001)         |
| title                         | VARCHAR(200) | NO   | -           | SR 제목                                      |
| description                   | TEXT         | NO   | -           | SR 상세 설명                                 |
| status                        | VARCHAR(20)  | NO   | 'REQUESTED' | 상태 (ENUM)                                  |
| priority                      | VARCHAR(20)  | NO   | 'MEDIUM'    | 우선순위 (ENUM)                              |
| **requested_priority**        | VARCHAR(20)  | NO   | 'MEDIUM'    | **[신규] 요청자 희망 우선순위 (ENUM)**       |
| **requested_completion_date** | TIMESTAMP    | YES  | NULL        | **[신규] 요청자 희망 완료일**                |
| client_id                     | VARCHAR(30)  | NO   | -           | 고객사 ID (FK)                               |
| requester_id                  | VARCHAR(30)  | NO   | -           | 요청자 ID (FK)                               |
| assignee_id                   | VARCHAR(30)  | YES  | NULL        | 담당자 ID (FK)                               |
| service_category_id           | VARCHAR(30)  | NO   | -           | 서비스 카테고리 ID (FK)                      |
| **intake_by_id**              | VARCHAR(30)  | YES  | NULL        | **[신규] 접수 처리자 ID (FK)**               |
| **actual_priority**           | VARCHAR(20)  | YES  | NULL        | **[신규] 실제 우선순위 (접수자 결정, ENUM)** |
| **intake_notes**              | TEXT         | YES  | NULL        | **[신규] 접수 메모/분석 내용**               |
| **estimated_hours**           | FLOAT        | YES  | NULL        | **[신규] 예상 작업 시간**                    |
| **estimated_completion_date** | TIMESTAMP    | YES  | NULL        | **[신규] 접수자가 설정한 예상 완료일**       |
| requested_at                  | TIMESTAMP    | NO   | now()       | 요청 시간                                    |
| intake_at                     | TIMESTAMP    | YES  | NULL        | 접수 시간                                    |
| due_date                      | TIMESTAMP    | YES  | NULL        | 완료 목표 시간 (SLA 기준)                    |
| expected_completion_date      | TIMESTAMP    | YES  | NULL        | 예상 완료일                                  |
| actual_completion_date        | TIMESTAMP    | YES  | NULL        | 실제 완료일                                  |
| completed_at                  | TIMESTAMP    | YES  | NULL        | 완료 시간                                    |
| confirmed_at                  | TIMESTAMP    | YES  | NULL        | 확인 완료 시간                               |
| resolution_description        | TEXT         | YES  | NULL        | 처리 결과 설명                               |
| rejection_reason              | TEXT         | YES  | NULL        | 거부 사유                                    |
| satisfaction_rating           | INT          | YES  | NULL        | 만족도 평가 (1-5)                            |
| additional_feedback           | TEXT         | YES  | NULL        | 추가 피드백                                  |
| attachment_count              | INT          | NO   | 0           | 첨부파일 수                                  |
| comment_count                 | INT          | NO   | 0           | 댓글 수                                      |
| created_at                    | TIMESTAMP    | NO   | now()       | 생성 시간                                    |
| updated_at                    | TIMESTAMP    | NO   | now()       | 수정 시간                                    |

**ENUM 타입:**

- **status**: `REQUESTED`, `INTAKE`, `IN_PROGRESS`, `ON_HOLD`, `COMPLETED`, `CONFIRMED`, `REJECTED`
- **priority**: `CRITICAL` (4h), `HIGH` (24h), `MEDIUM` (72h), `LOW` (168h)

**인덱스:**

- PRIMARY KEY: `id`
- UNIQUE: `sr_number`
- INDEX: `(client_id, status)`
- INDEX: `(requester_id, created_at)`
- INDEX: `(assignee_id, status)`
- INDEX: `(status, priority, created_at)`

**외래 키:**

- `client_id` REFERENCES `clients(id)`
- `requester_id` REFERENCES `users(id)`
- `assignee_id` REFERENCES `users(id)` ON DELETE SET NULL
- `service_category_id` REFERENCES `service_categories(id)`
- **`intake_by_id` REFERENCES `users(id)` ON DELETE SET NULL** [신규]

---

### 11. sr_activities (SR 활동 내역)

SR의 모든 변경 이력

| 컬럼명      | 데이터 타입 | NULL | 기본값 | 설명                          |
| ----------- | ----------- | ---- | ------ | ----------------------------- |
| id          | VARCHAR(30) | NO   | cuid() | 활동 고유 ID (PK)             |
| sr_id       | VARCHAR(30) | NO   | -      | SR ID (FK)                    |
| user_id     | VARCHAR(30) | NO   | -      | 수행자 ID (FK)                |
| type        | VARCHAR(50) | NO   | -      | 활동 유형 (ENUM)              |
| description | TEXT        | NO   | -      | 활동 설명                     |
| metadata    | JSONB       | YES  | NULL   | 추가 정보 (이전 값, 새 값 등) |
| created_at  | TIMESTAMP   | NO   | now()  | 생성 시간                     |

**ENUM 타입 (type):**

- `CREATED`: SR 생성
- `STATUS_CHANGED`: 상태 변경
- `PRIORITY_CHANGED`: 우선순위 변경
- `ASSIGNED`: 담당자 할당
- `REASSIGNED`: 담당자 재할당
- `COMMENTED`: 댓글 작성
- `ATTACHMENT_ADDED`: 첨부파일 추가
- `ATTACHMENT_REMOVED`: 첨부파일 삭제
- `REOPENED`: 재오픈
- `COMPLETED`: 완료
- `REJECTED`: 거절

**인덱스:**

- PRIMARY KEY: `id`
- INDEX: `(sr_id, created_at)`
- INDEX: `user_id`

**외래 키:**

- `sr_id` REFERENCES `srs(id)` ON DELETE CASCADE
- `user_id` REFERENCES `users(id)`

---

### 12. sr_comments (SR 댓글)

SR에 대한 댓글

| 컬럼명      | 데이터 타입 | NULL | 기본값 | 설명              |
| ----------- | ----------- | ---- | ------ | ----------------- |
| id          | VARCHAR(30) | NO   | cuid() | 댓글 고유 ID (PK) |
| sr_id       | VARCHAR(30) | NO   | -      | SR ID (FK)        |
| user_id     | VARCHAR(30) | NO   | -      | 작성자 ID (FK)    |
| content     | TEXT        | NO   | -      | 댓글 내용         |
| is_internal | BOOLEAN     | NO   | false  | 내부 메모 여부    |
| created_at  | TIMESTAMP   | NO   | now()  | 생성 시간         |
| updated_at  | TIMESTAMP   | NO   | now()  | 수정 시간         |

**인덱스:**

- PRIMARY KEY: `id`
- INDEX: `(sr_id, created_at)`
- INDEX: `user_id`

**외래 키:**

- `sr_id` REFERENCES `srs(id)` ON DELETE CASCADE
- `user_id` REFERENCES `users(id)`

---

### 13. sr_attachments (SR 첨부파일)

SR의 첨부파일 메타데이터

| 컬럼명      | 데이터 타입  | NULL | 기본값 | 설명                  |
| ----------- | ------------ | ---- | ------ | --------------------- |
| id          | VARCHAR(30)  | NO   | cuid() | 첨부파일 고유 ID (PK) |
| sr_id       | VARCHAR(30)  | NO   | -      | SR ID (FK)            |
| file_name   | VARCHAR(255) | NO   | -      | 파일명                |
| file_size   | INTEGER      | NO   | -      | 파일 크기 (bytes)     |
| file_type   | VARCHAR(100) | NO   | -      | MIME 타입             |
| file_url    | TEXT         | NO   | -      | Vercel Blob URL       |
| uploaded_by | VARCHAR(30)  | NO   | -      | 업로드한 사용자 ID    |
| created_at  | TIMESTAMP    | NO   | now()  | 생성 시간             |

**인덱스:**

- PRIMARY KEY: `id`
- INDEX: `sr_id`

**외래 키:**

- `sr_id` REFERENCES `srs(id)` ON DELETE CASCADE

**저장 위치:** Vercel Blob - `sr-attachments` 경로

---

### 14. notifications (알림)

시스템 알림 이력

| 컬럼명      | 데이터 타입  | NULL | 기본값    | 설명                           |
| ----------- | ------------ | ---- | --------- | ------------------------------ |
| id          | VARCHAR(30)  | NO   | cuid()    | 알림 고유 ID (PK)              |
| type        | VARCHAR(20)  | NO   | -         | 알림 유형 (ENUM)               |
| status      | VARCHAR(20)  | NO   | 'PENDING' | 발송 상태 (ENUM)               |
| recipient   | VARCHAR(255) | NO   | -         | 수신자 (이메일 또는 사용자 ID) |
| subject     | VARCHAR(255) | YES  | NULL      | 제목                           |
| content     | TEXT         | NO   | -         | 내용                           |
| metadata    | JSONB        | YES  | NULL      | 추가 정보                      |
| sent_at     | TIMESTAMP    | YES  | NULL      | 발송 시간                      |
| fail_reason | TEXT         | YES  | NULL      | 실패 사유                      |
| created_at  | TIMESTAMP    | NO   | now()     | 생성 시간                      |

**ENUM 타입:**

- **type**: `EMAIL`, `MATTERMOST`, `IN_APP`, `PUSH`
- **status**: `PENDING`, `SENT`, `FAILED`

**인덱스:**

- PRIMARY KEY: `id`
- INDEX: `(status, created_at)`
- INDEX: `recipient`

---

### 15. push_subscriptions (웹 푸시 구독)

웹 푸시 알림을 위한 브라우저 구독 정보

| 컬럼명     | 데이터 타입 | NULL | 기본값 | 설명                            |
| ---------- | ----------- | ---- | ------ | ------------------------------- |
| id         | VARCHAR(30) | NO   | cuid() | 구독 고유 ID (PK)               |
| user_id    | VARCHAR(30) | NO   | -      | 사용자 ID (FK)                  |
| endpoint   | TEXT        | NO   | -      | 푸시 서비스 엔드포인트 URL (UK) |
| p256dh     | TEXT        | NO   | -      | 암호화 키 (P256DH)              |
| auth       | TEXT        | NO   | -      | 인증 키 (Auth)                  |
| user_agent | TEXT        | YES  | NULL   | 구독한 브라우저/기기 정보       |
| created_at | TIMESTAMP   | NO   | now()  | 생성 시간                       |
| updated_at | TIMESTAMP   | NO   | now()  | 수정 시간                       |

**인덱스:**

- PRIMARY KEY: `id`
- UNIQUE: `endpoint`
- INDEX: `user_id`

**외래 키:**

- `user_id` REFERENCES `users(id)` ON DELETE CASCADE

---

### 16. notification_preferences (알림 설정)

사용자별 이메일 및 푸시 알림 수신 설정

| 컬럼명                      | 데이터 타입 | NULL | 기본값 | 설명                       |
| --------------------------- | ----------- | ---- | ------ | -------------------------- |
| id                          | VARCHAR(30) | NO   | cuid() | 설정 고유 ID (PK)          |
| user_id                     | VARCHAR(30) | NO   | -      | 사용자 ID (FK, UK)         |
| **email_sr_created**        | BOOLEAN     | NO   | true   | [이메일] 신규 SR 생성 알림 |
| **email_sr_assigned**       | BOOLEAN     | NO   | true   | [이메일] SR 담당 배정 알림 |
| **email_sr_status_changed** | BOOLEAN     | NO   | false  | [이메일] SR 상태 변경 알림 |
| **email_comment_added**     | BOOLEAN     | NO   | false  | [이메일] 새 댓글 알림      |
| **push_sr_created**         | BOOLEAN     | NO   | true   | [푸시] 신규 SR 생성 알림   |
| **push_sr_assigned**        | BOOLEAN     | NO   | true   | [푸시] SR 담당 배정 알림   |
| **push_sr_status_changed**  | BOOLEAN     | NO   | false  | [푸시] SR 상태 변경 알림   |
| **push_comment_added**      | BOOLEAN     | NO   | false  | [푸시] 새 댓글 알림        |
| created_at                  | TIMESTAMP   | NO   | now()  | 생성 시간                  |
| updated_at                  | TIMESTAMP   | NO   | now()  | 수정 시간                  |

**인덱스:**

- PRIMARY KEY: `id`
- UNIQUE: `user_id`

**외래 키:**

- `user_id` REFERENCES `users(id)` ON DELETE CASCADE

---

## DDL (Data Definition Language)

### Prisma Schema

**prisma/schema.prisma** (전체 스키마):

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

// ============================================================================
// 인증 및 사용자 관리
// ============================================================================

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String
  password      String
  emailVerified DateTime? @map("email_verified")
  image         String?
  isActive      Boolean   @default(true) @map("is_active")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  // Relations
  accounts      Account[]
  sessions      Session[]
  roles         UserRole[]
  clients       UserClient[]

  // SR Relations
  createdSRs           SR[]              @relation("SRRequester")
  assignedSRs          SR[]              @relation("SRAssignee")
  intakedSRs           SR[]              @relation("SRIntakeBy")
  srActivities         SRActivity[]
  srComments           SRComment[]
  srStatusHistory      SRStatusHistory[] @relation("StatusChangeUser")

  // ServiceCategory Relations
  handledCategories    ServiceCategory[] @relation("CategoryHandler")
  backupCategories     ServiceCategory[] @relation("CategoryBackupHandler")

  // ClientHandler Relations
  clientHandlers       ClientHandler[]   @relation("ClientHandlerUser")
  backupHandlers       ClientHandler[]   @relation("ClientHandlerBackup")

  @@index([email])
  @@index([isActive])
  @@map("users")
}

model Account {
  id                String  @id @default(cuid())
  userId            String  @map("user_id")
  type              String
  provider          String
  providerAccountId String  @map("provider_account_id")
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@index([userId])
  @@map("accounts")
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique @map("session_token")
  userId       String   @map("user_id")
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("sessions")
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
  @@map("verification_tokens")
}

// ============================================================================
// 권한 관리 (RBAC)
// ============================================================================

model Role {
  id          String       @id @default(cuid())
  name        String       @unique
  description String?
  createdAt   DateTime     @default(now()) @map("created_at")
  updatedAt   DateTime     @updatedAt @map("updated_at")

  users       UserRole[]
  permissions Permission[]

  @@map("roles")
}

model UserRole {
  id        String   @id @default(cuid())
  userId    String   @map("user_id")
  roleId    String   @map("role_id")
  createdAt DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  role Role @relation(fields: [roleId], references: [id], onDelete: Cascade)

  @@unique([userId, roleId])
  @@index([userId])
  @@index([roleId])
  @@map("user_roles")
}

model Permission {
  id       String @id @default(cuid())
  roleId   String @map("role_id")
  resource String
  action   String

  role Role @relation(fields: [roleId], references: [id], onDelete: Cascade)

  @@unique([roleId, resource, action])
  @@index([roleId])
  @@map("permissions")
}

// ============================================================================
// 고객사 관리
// ============================================================================

model Client {
  id                String    @id @default(cuid())
  code              String    @unique // SR 번호 생성에 사용되는 고유 코드 (예: "ACME", "BETA")
  name              String
  industry          String?
  contactPerson     String?   @map("contact_person")
  contactEmail      String?   @map("contact_email")
  contactPhone      String?   @map("contact_phone")
  address           String?
  contractStartDate DateTime? @map("contract_start_date") @db.Date
  contractEndDate   DateTime? @map("contract_end_date") @db.Date
  isActive          Boolean   @default(true) @map("is_active")
  createdAt         DateTime  @default(now()) @map("created_at")
  updatedAt         DateTime  @updatedAt @map("updated_at")

  // Relations
  users             UserClient[]
  srs               SR[]
  serviceCategories ServiceCategory[]
  clientHandlers    ClientHandler[]

  @@index([name])
  @@index([code])
  @@index([isActive])
  @@map("clients")
}

model UserClient {
  id        String   @id @default(cuid())
  userId    String   @map("user_id")
  clientId  String   @map("client_id")
  createdAt DateTime @default(now()) @map("created_at")

  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  client Client @relation(fields: [clientId], references: [id], onDelete: Cascade)

  @@unique([userId, clientId])
  @@index([userId])
  @@index([clientId])
  @@map("user_clients")
}

model ServiceCategory {
  id              String     @id @default(cuid())
  clientId        String     @map("client_id")
  categoryName    String     @map("category_name")
  description     String?    @db.Text
  slaHours        Int        @map("sla_hours")        // SLA 시간 (시간 단위)
  priority        SRPriority @default(MEDIUM)
  handlerId       String?    @map("handler_id")       // 기본 담당자
  backupHandlerId String?    @map("backup_handler_id") // 대체 담당자
  isActive        Boolean    @default(true) @map("is_active")
  createdAt       DateTime   @default(now()) @map("created_at")
  updatedAt       DateTime   @updatedAt @map("updated_at")

  // Relations
  client        Client @relation(fields: [clientId], references: [id])
  handler       User?  @relation("CategoryHandler", fields: [handlerId], references: [id])
  backupHandler User?  @relation("CategoryBackupHandler", fields: [backupHandlerId], references: [id])
  srs           SR[]

  @@index([clientId])
  @@index([handlerId])
  @@map("service_categories")
}

model ClientHandler {
  id              String    @id @default(cuid())
  clientId        String    @map("client_id")
  userId          String    @map("user_id")
  mattermostId    String?   @map("mattermost_id")
  backupHandlerId String?   @map("backup_handler_id")
  assignedDate    DateTime  @default(now()) @map("assigned_date")
  unassignedDate  DateTime? @map("unassigned_date")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  // Relations
  client        Client @relation(fields: [clientId], references: [id])
  user          User   @relation("ClientHandlerUser", fields: [userId], references: [id])
  backupHandler User?  @relation("ClientHandlerBackup", fields: [backupHandlerId], references: [id])

  @@unique([clientId, userId])
  @@index([clientId])
  @@index([userId])
  @@map("client_handlers")
}

// ============================================================================
// SR 관리
// ============================================================================

enum SRStatus {
  REQUESTED   // 신청 (초기 상태)
  INTAKE      // 접수 (담당자 확인)
  IN_PROGRESS // 진행 중
  ON_HOLD     // 보류
  COMPLETED   // 완료 (담당자 완료 처리)
  CONFIRMED   // 확인 완료 (신청자 확인)
  REJECTED    // 거절
}

enum SRPriority {
  CRITICAL
  HIGH
  MEDIUM
  LOW
}

model SR {
  id                      String     @id @default(cuid())
  srNumber                String     @unique @map("sr_number")
  title                   String
  description             String     @db.Text
  status                  SRStatus   @default(REQUESTED)
  priority                SRPriority @default(MEDIUM)

  // ===== 요청자 입력 필드 =====
  requestedPriority       SRPriority @default(MEDIUM) @map("requested_priority")
  requestedCompletionDate DateTime?  @map("requested_completion_date")

  // FK 관계
  clientId                String  @map("client_id")
  requesterId             String  @map("requester_id")
  assigneeId              String? @map("assignee_id")
  serviceCategoryId       String  @map("service_category_id")

  // ===== 접수자 분석 필드 =====
  intakeById              String?     @map("intake_by_id")
  actualPriority          SRPriority? @map("actual_priority")
  intakeNotes             String?     @map("intake_notes") @db.Text
  estimatedHours          Float?      @map("estimated_hours")
  estimatedCompletionDate DateTime?   @map("estimated_completion_date")

  // 날짜 필드
  requestedAt             DateTime  @default(now()) @map("requested_at")
  intakeAt                DateTime? @map("intake_at")
  completedAt             DateTime? @map("completed_at")
  confirmedAt             DateTime? @map("confirmed_at")
  dueDate                 DateTime? @map("due_date")
  expectedCompletionDate  DateTime? @map("expected_completion_date")
  actualCompletionDate    DateTime? @map("actual_completion_date")

  // 완료 관련
  resolutionDescription   String? @map("resolution_description") @db.Text
  rejectionReason         String? @map("rejection_reason") @db.Text

  // 만족도
  satisfactionRating      Int?    @map("satisfaction_rating")
  additionalFeedback      String? @map("additional_feedback") @db.Text

  // 카운터
  attachmentCount         Int @default(0) @map("attachment_count")
  commentCount            Int @default(0) @map("comment_count")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  // Relations
  client          Client          @relation(fields: [clientId], references: [id])
  requester       User            @relation("SRRequester", fields: [requesterId], references: [id])
  assignee        User?           @relation("SRAssignee", fields: [assigneeId], references: [id])
  intakeBy        User?           @relation("SRIntakeBy", fields: [intakeById], references: [id])
  serviceCategory ServiceCategory @relation(fields: [serviceCategoryId], references: [id])
  activities      SRActivity[]
  comments        SRComment[]
  attachments     SRAttachment[]
  statusHistory   SRStatusHistory[]

  @@index([clientId, status])
  @@index([requesterId, createdAt])
  @@index([assigneeId, status])
  @@index([serviceCategoryId])
  @@index([srNumber])
  @@index([status, priority, createdAt])
  @@index([intakeById])
  @@map("srs")
}

enum SRActivityType {
  CREATED
  STATUS_CHANGED
  PRIORITY_CHANGED
  ASSIGNED
  REASSIGNED
  COMMENTED
  ATTACHMENT_ADDED
  ATTACHMENT_REMOVED
  REOPENED
  COMPLETED
  REJECTED
}

model SRActivity {
  id          String         @id @default(cuid())
  srId        String         @map("sr_id")
  userId      String         @map("user_id")
  type        SRActivityType
  description String         @db.Text
  metadata    Json?
  createdAt   DateTime       @default(now()) @map("created_at")

  sr   SR   @relation(fields: [srId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id])

  @@index([srId, createdAt])
  @@index([userId])
  @@map("sr_activities")
}

model SRComment {
  id         String   @id @default(cuid())
  srId       String   @map("sr_id")
  userId     String   @map("user_id")
  content    String   @db.Text
  isInternal Boolean  @default(false) @map("is_internal")
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  sr   SR   @relation(fields: [srId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id])

  @@index([srId, createdAt])
  @@index([userId])
  @@map("sr_comments")
}

model SRAttachment {
  id         String   @id @default(cuid())
  srId       String   @map("sr_id")
  fileName   String   @map("file_name")
  fileSize   Int      @map("file_size")
  fileType   String   @map("file_type")
  fileUrl    String   @map("file_url")
  uploadedBy String   @map("uploaded_by")
  createdAt  DateTime @default(now()) @map("created_at")

  sr SR @relation(fields: [srId], references: [id], onDelete: Cascade)

  @@index([srId])
  @@map("sr_attachments")
}

// ============================================================================
// 알림 관리
// ============================================================================

enum NotificationType {
  EMAIL
  MATTERMOST
  IN_APP
}

enum NotificationStatus {
  PENDING
  SENT
  FAILED
}

model Notification {
  id         String             @id @default(cuid())
  type       NotificationType
  status     NotificationStatus @default(PENDING)
  recipient  String
  subject    String?
  content    String             @db.Text
  metadata   Json?
  sentAt     DateTime?          @map("sent_at")
  failReason String?            @map("fail_reason")
  createdAt  DateTime           @default(now()) @map("created_at")

  @@index([status, createdAt])
  @@index([recipient])
  @@map("notifications")
}

// ============================================================================
// SR 상태 이력
// ============================================================================

model SRStatusHistory {
  id             String    @id @default(cuid())
  srId           String    @map("sr_id")
  previousStatus SRStatus? @map("previous_status")
  currentStatus  SRStatus  @map("current_status")
  changedBy      String    @map("changed_by")
  changeReason   String?   @map("change_reason") @db.Text
  changedAt      DateTime  @default(now()) @map("changed_at")

  // Relations
  sr   SR   @relation(fields: [srId], references: [id], onDelete: Cascade)
  user User @relation("StatusChangeUser", fields: [changedBy], references: [id])

  @@index([srId, changedAt])
  @@index([changedBy])
  @@map("sr_status_history")
}
```

### 마이그레이션 생성

```bash
# Prisma 마이그레이션 생성
npx prisma migrate dev --name init

# Production 배포
npx prisma migrate deploy
```

---

## 인덱스 전략

### 인덱스 설계 원칙

1. **WHERE 절에 자주 사용되는 컬럼**: 검색 성능 향상
2. **JOIN 조건 컬럼**: 조인 성능 향상
3. **ORDER BY 컬럼**: 정렬 성능 향상
4. **복합 인덱스**: 여러 컬럼을 함께 조회하는 경우

### 주요 인덱스 목록

| 테이블        | 인덱스 컬럼                    | 타입   | 목적                      |
| ------------- | ------------------------------ | ------ | ------------------------- |
| users         | email                          | UNIQUE | 중복 방지 및 로그인 조회  |
| users         | is_active                      | INDEX  | 활성 사용자 필터링        |
| srs           | sr_number                      | UNIQUE | 중복 방지 및 검색         |
| srs           | (client_id, status)            | INDEX  | 고객사별 SR 상태 조회     |
| srs           | (requester_id, created_at)     | INDEX  | 사용자별 SR 목록 (최신순) |
| srs           | (assignee_id, status)          | INDEX  | 담당자별 SR 상태 조회     |
| srs           | (status, priority, created_at) | INDEX  | SR 목록 필터링 및 정렬    |
| sr_activities | (sr_id, created_at)            | INDEX  | SR별 활동 내역 조회       |
| sr_comments   | (sr_id, created_at)            | INDEX  | SR별 댓글 조회            |

### 인덱스 생성 SQL

```sql
-- users 테이블
CREATE UNIQUE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_is_active ON users(is_active);

-- srs 테이블
CREATE UNIQUE INDEX idx_srs_sr_number ON srs(sr_number);
CREATE INDEX idx_srs_client_status ON srs(client_id, status);
CREATE INDEX idx_srs_requester_created ON srs(requester_id, created_at DESC);
CREATE INDEX idx_srs_assignee_status ON srs(assignee_id, status);
CREATE INDEX idx_srs_status_priority_created ON srs(status, priority, created_at DESC);

-- sr_activities 테이블
CREATE INDEX idx_sr_activities_sr_created ON sr_activities(sr_id, created_at DESC);

-- sr_comments 테이블
CREATE INDEX idx_sr_comments_sr_created ON sr_comments(sr_id, created_at DESC);
```

---

## 제약 조건

### Primary Key

모든 테이블은 `id` 컬럼을 Primary Key로 사용:

- 타입: `VARCHAR(30)` (cuid 형식)
- 자동 생성: Prisma의 `@default(cuid())`

### Foreign Key

외래 키 제약 조건:

```sql
-- accounts 테이블
ALTER TABLE accounts
  ADD CONSTRAINT fk_accounts_user
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- sessions 테이블
ALTER TABLE sessions
  ADD CONSTRAINT fk_sessions_user
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- user_roles 테이블
ALTER TABLE user_roles
  ADD CONSTRAINT fk_user_roles_user
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_user_roles_role
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE;

-- permissions 테이블
ALTER TABLE permissions
  ADD CONSTRAINT fk_permissions_role
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE;

-- user_clients 테이블
ALTER TABLE user_clients
  ADD CONSTRAINT fk_user_clients_user
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_user_clients_client
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

-- srs 테이블
ALTER TABLE srs
  ADD CONSTRAINT fk_srs_client
  FOREIGN KEY (client_id) REFERENCES clients(id),
  ADD CONSTRAINT fk_srs_requester
  FOREIGN KEY (requester_id) REFERENCES users(id),
  ADD CONSTRAINT fk_srs_assignee
  FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL;

-- sr_activities 테이블
ALTER TABLE sr_activities
  ADD CONSTRAINT fk_sr_activities_sr
  FOREIGN KEY (sr_id) REFERENCES srs(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_sr_activities_user
  FOREIGN KEY (user_id) REFERENCES users(id);

-- sr_comments 테이블
ALTER TABLE sr_comments
  ADD CONSTRAINT fk_sr_comments_sr
  FOREIGN KEY (sr_id) REFERENCES srs(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_sr_comments_user
  FOREIGN KEY (user_id) REFERENCES users(id);

-- sr_attachments 테이블
ALTER TABLE sr_attachments
  ADD CONSTRAINT fk_sr_attachments_sr
  FOREIGN KEY (sr_id) REFERENCES srs(id) ON DELETE CASCADE;
```

### Check 제약 조건

```sql
-- users 테이블
ALTER TABLE users
  ADD CONSTRAINT chk_users_email_format
  CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$');

-- sr_attachments 테이블
ALTER TABLE sr_attachments
  ADD CONSTRAINT chk_sr_attachments_file_size
  CHECK (file_size > 0 AND file_size <= 10485760); -- 10MB
```

---

## 초기 데이터

### Role 초기 데이터

**prisma/seeds/roles.ts**:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ROLES = [
  {
    name: 'SYSTEM_ADMIN',
    description: '시스템 관리자 - 모든 권한',
  },
  {
    name: 'CLIENT_ADMIN',
    description: '고객사 관리자 - 고객사 내 모든 권한',
  },
  {
    name: 'DEVELOPER',
    description: '개발자 - SR 처리 권한',
  },
  {
    name: 'CLIENT_USER',
    description: '고객사 사용자 - SR 요청 및 조회 권한',
  },
];

async function seedRoles() {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: role,
    });
  }
  console.log('✅ Roles seeded');
}

export default seedRoles;
```

### Permission 초기 데이터

**prisma/seeds/permissions.ts**:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ROLE_PERMISSIONS = {
  SYSTEM_ADMIN: [
    { resource: 'system', action: 'admin' },
    { resource: 'user', action: 'create' },
    { resource: 'user', action: 'read' },
    { resource: 'user', action: 'update' },
    { resource: 'user', action: 'delete' },
    { resource: 'role', action: 'manage' },
    { resource: 'client', action: 'create' },
    { resource: 'client', action: 'read' },
    { resource: 'client', action: 'update' },
    { resource: 'client', action: 'delete' },
    { resource: 'sr', action: 'create' },
    { resource: 'sr', action: 'read' },
    { resource: 'sr', action: 'update' },
    { resource: 'sr', action: 'delete' },
    { resource: 'sr', action: 'assign' },
  ],
  CLIENT_ADMIN: [
    { resource: 'client', action: 'read' },
    { resource: 'client', action: 'update' },
    { resource: 'user', action: 'create' },
    { resource: 'user', action: 'read' },
    { resource: 'user', action: 'update' },
    { resource: 'sr', action: 'create' },
    { resource: 'sr', action: 'read' },
    { resource: 'sr', action: 'update' },
  ],
  DEVELOPER: [
    { resource: 'sr', action: 'read' },
    { resource: 'sr', action: 'update' },
  ],
  CLIENT_USER: [
    { resource: 'client', action: 'read' },
    { resource: 'sr', action: 'create' },
    { resource: 'sr', action: 'read' },
    { resource: 'sr', action: 'update' },
  ],
};

async function seedPermissions() {
  for (const [roleName, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) continue;

    for (const perm of permissions) {
      await prisma.permission.upsert({
        where: {
          roleId_resource_action: {
            roleId: role.id,
            resource: perm.resource,
            action: perm.action,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          resource: perm.resource,
          action: perm.action,
        },
      });
    }
  }
  console.log('✅ Permissions seeded');
}

export default seedPermissions;
```

### Seed 실행

**prisma/seed.ts**:

```typescript
import { PrismaClient } from '@prisma/client';
import seedRoles from './seeds/roles';
import seedPermissions from './seeds/permissions';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  await seedRoles();
  await seedPermissions();

  console.log('✅ Seed completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

**실행 명령:**

```bash
npx prisma db seed
```

---

## 마이그레이션 가이드

### 로컬 환경 설정

```bash
# 1. Supabase 프로젝트 생성
# https://supabase.com/dashboard

# 2. 환경 변수 설정 (.env.local)
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres"

# 3. Prisma 클라이언트 생성
npx prisma generate

# 4. 마이그레이션 생성 및 적용
npx prisma migrate dev --name init

# 5. 초기 데이터 시드
npx prisma db seed

# 6. Prisma Studio로 데이터 확인
npx prisma studio
```

### Production 배포

```bash
# 1. Supabase Production 프로젝트에 마이그레이션 배포
npx prisma migrate deploy

# 2. 초기 데이터 시드
npx prisma db seed

# 3. 연결 확인
npx prisma db pull
```

### 마이그레이션 롤백

```bash
# 마이그레이션 상태 확인
npx prisma migrate status

# 특정 마이그레이션 롤백 (수동)
# 1. SQL 파일에서 DROP 문 작성
# 2. Supabase SQL Editor에서 실행
# 3. Prisma 마이그레이션 히스토리 업데이트
npx prisma migrate resolve --rolled-back [migration_name]
```

---

**문서 버전 관리:**

| 버전 | 작성자           | 변경 사항 | 작성일     |
| ---- | ---------------- | --------- | ---------- |
| 1.0  | Development Team | 초안 작성 | 2025-11-06 |

---

_이 문서는 SR 관리 시스템의 데이터베이스 설계를 정의하는 핵심 문서입니다. 스키마 변경 시 마이그레이션을 생성하고 이 문서를 업데이트해야 합니다._
