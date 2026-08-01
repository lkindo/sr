import { describe, expect, it } from 'vitest';

import {
  clientCreateSchema,
  FIELD_LIMITS,
  intakeSchema,
  registerSchema,
  roleCreateSchema,
  serviceCategoryCreateSchema,
  srCreateSchema,
  srUpdateSchema,
  userCreateSchema,
} from '../schemas';

/**
 * 감사 4.3 회귀 테스트 — 문자열 길이 상한.
 *
 * 대부분의 텍스트 필드에 `min` 만 있고 `max` 가 없어, 인증된 단일 POST 로 거대한 텍스트를
 * Postgres 에 영속시킬 수 있었다. strict 레이트리밋(5/min)이어도 분당 수백 MB 다.
 */

const str = (n: number) => 'ㄱ'.repeat(n);
const asciiStr = (n: number) => 'a'.repeat(n);

describe('FIELD_LIMITS 는 DB 컬럼 폭과 어긋나지 않는다', () => {
  // zod 상한이 컬럼보다 크면 검증은 통과하고 DB 가 거부해, 원인을 알 수 없는 500 이 된다.
  it('NAME 은 users.name / roles.name 의 varchar(50) 이하다', () => {
    expect(FIELD_LIMITS.NAME).toBeLessThanOrEqual(50);
  });

  it('DISPLAY_NAME 은 clients.name 의 varchar(100) 이하다', () => {
    expect(FIELD_LIMITS.DISPLAY_NAME).toBeLessThanOrEqual(100);
  });

  it('TITLE 은 srs.title 의 varchar(255) 이하다', () => {
    expect(FIELD_LIMITS.TITLE).toBeLessThanOrEqual(255);
  });

  it('ADDRESS 는 clients.address 의 varchar(500) 이하다', () => {
    expect(FIELD_LIMITS.ADDRESS).toBeLessThanOrEqual(500);
  });

  it('PHONE 은 clients.contact_phone 의 varchar(30) 이하다', () => {
    expect(FIELD_LIMITS.PHONE).toBeLessThanOrEqual(30);
  });

  it('SHORT_TEXT 는 roles.description 의 varchar(255) 이하다', () => {
    expect(FIELD_LIMITS.SHORT_TEXT).toBeLessThanOrEqual(255);
  });
});

describe('사용자 이름', () => {
  // 이전에는 .max(100) 이었는데 users.name 은 varchar(50) 이라,
  // 51~100자 이름이 zod 를 통과한 뒤 DB 에서 터졌다.
  it('상한 이하는 통과한다', () => {
    const r = registerSchema.safeParse({
      name: str(FIELD_LIMITS.NAME),
      email: 'a@example.com',
      password: 'ValidPass1!',
      confirmPassword: 'ValidPass1!',
    });
    expect(r.success).toBe(true);
  });

  it('DB 컬럼 폭을 넘는 이름은 거부한다', () => {
    const r = registerSchema.safeParse({
      name: str(FIELD_LIMITS.NAME + 1),
      email: 'a@example.com',
      password: 'ValidPass1!',
      confirmPassword: 'ValidPass1!',
    });
    expect(r.success).toBe(false);
  });

  it('userCreateSchema 도 같은 상한을 쓴다', () => {
    expect(
      userCreateSchema.safeParse({
        name: str(FIELD_LIMITS.NAME + 1),
        email: 'a@example.com',
        password: 'ValidPass1!',
      }).success
    ).toBe(false);
  });
});

describe('SR 본문', () => {
  const base = {
    clientId: 'c1',
    serviceCategoryId: 'cat1',
    requestedPriority: 'MEDIUM' as const,
  };

  it('제목 상한을 넘으면 거부한다', () => {
    expect(
      srCreateSchema.safeParse({
        ...base,
        title: str(FIELD_LIMITS.TITLE + 1),
        description: str(20),
      }).success
    ).toBe(false);
  });

  it('설명 상한을 넘으면 거부한다', () => {
    expect(
      srCreateSchema.safeParse({
        ...base,
        title: str(20),
        description: str(FIELD_LIMITS.LONG_TEXT + 1),
      }).success
    ).toBe(false);
  });

  it('상한 이하는 통과한다', () => {
    expect(
      srCreateSchema.safeParse({
        ...base,
        title: str(FIELD_LIMITS.TITLE),
        description: str(FIELD_LIMITS.LONG_TEXT),
      }).success
    ).toBe(true);
  });

  it('수정 스키마의 자유 텍스트에도 상한이 있다', () => {
    for (const field of [
      'resolutionDescription',
      'rejectionReason',
      'additionalFeedback',
      'intakeNotes',
    ] as const) {
      expect(
        srUpdateSchema.safeParse({ [field]: str(FIELD_LIMITS.NOTE + 1) }).success,
        `${field} 에 상한이 없다`
      ).toBe(false);
    }
  });
});

describe('고객사', () => {
  it('코드·이름·주소·전화번호 상한을 강제한다', () => {
    const valid = { code: 'ACME', name: '에이스' };

    expect(
      clientCreateSchema.safeParse({ ...valid, code: asciiStr(FIELD_LIMITS.CODE + 1) }).success
    ).toBe(false);
    expect(
      clientCreateSchema.safeParse({ ...valid, name: str(FIELD_LIMITS.DISPLAY_NAME + 1) }).success
    ).toBe(false);
    expect(
      clientCreateSchema.safeParse({ ...valid, address: str(FIELD_LIMITS.ADDRESS + 1) }).success
    ).toBe(false);
    expect(
      clientCreateSchema.safeParse({ ...valid, contactPhone: asciiStr(FIELD_LIMITS.PHONE + 1) })
        .success
    ).toBe(false);
  });

  it('정상 범위는 통과한다', () => {
    expect(
      clientCreateSchema.safeParse({
        code: 'ACME',
        name: '에이스',
        address: str(FIELD_LIMITS.ADDRESS),
        contactPhone: asciiStr(FIELD_LIMITS.PHONE),
      }).success
    ).toBe(true);
  });
});

describe('역할·카테고리·접수 메모', () => {
  it('역할 이름과 설명에 상한이 있다', () => {
    expect(roleCreateSchema.safeParse({ name: str(FIELD_LIMITS.NAME + 1) }).success).toBe(false);
    expect(
      roleCreateSchema.safeParse({ name: 'R', description: str(FIELD_LIMITS.SHORT_TEXT + 1) })
        .success
    ).toBe(false);
  });

  it('카테고리 이름과 설명에 상한이 있다', () => {
    const base = { slaHours: 24, priority: 'MEDIUM' as const };
    expect(
      serviceCategoryCreateSchema.safeParse({
        ...base,
        categoryName: str(FIELD_LIMITS.DISPLAY_NAME + 1),
      }).success
    ).toBe(false);
    expect(
      serviceCategoryCreateSchema.safeParse({
        ...base,
        categoryName: '일반',
        description: str(FIELD_LIMITS.SHORT_TEXT + 1),
      }).success
    ).toBe(false);
  });

  it('접수 메모에 상한이 있다', () => {
    expect(
      intakeSchema.safeParse({
        actualPriority: 'HIGH',
        estimatedHours: 8,
        estimatedCompletionDate: '2026-09-01',
        assigneeId: 'u1',
        intakeNotes: str(FIELD_LIMITS.NOTE + 1),
      }).success
    ).toBe(false);
  });
});
