// zod 없이 읽을 수 있어야 한다. 클라이언트가 숫자 몇 개를 위해 스키마 전체를 싣지 않게 분리했다.

/**
 * 문자열 필드 길이 상한 (감사 4.3).
 *
 * 대부분의 텍스트 필드에 `min` 만 있고 `max` 가 없어, 인증된 단일 POST 로 거대한 텍스트를
 * Postgres 에 영속시킬 수 있었다.
 *
 * **값은 `prisma/schema.prisma` 의 컬럼 폭에서 도출한다.** zod 상한이 컬럼보다 크면
 * 검증은 통과하고 DB 가 거부해, 사용자에게는 원인을 알 수 없는 500 으로 보인다.
 * (실제로 `registerSchema.name` / `userCreateSchema.name` 이 `.max(100)` 인데
 *  `users.name` 은 varchar(50) 이라 51~100자 이름이 정확히 그 경로를 밟고 있었다.)
 *
 * 컬럼이 무제한 TEXT 인 필드(description, 코멘트, 메모 등)는 DB 제약이 없으므로
 * 여기서 정하는 값이 유일한 상한이다.
 */
export const FIELD_LIMITS = {
  // varchar(50) — users.name, roles.name, clients.contactPerson
  NAME: 50,
  // varchar(100) — clients.name, clients.industry, service_categories.categoryName
  DISPLAY_NAME: 100,
  // varchar(50) — clients.code, permissions.resource/action
  CODE: 50,
  // varchar(255) — users.email, clients.contactEmail
  EMAIL: 255,
  // varchar(30) — clients.contactPhone
  PHONE: 30,
  // varchar(500) — clients.address
  ADDRESS: 500,
  // varchar(255) — roles.description, service_categories.description
  SHORT_TEXT: 255,
  // varchar(255) — srs.title (여유를 두고 200)
  TITLE: 200,
  // varchar(1024) — users.image
  URL: 1024,
  // TEXT (DB 무제한) — srs.description
  LONG_TEXT: 10_000,
  // TEXT (DB 무제한) — sr_comments.content, intake_notes, resolution/rejection 등
  NOTE: 5_000,
} as const;
