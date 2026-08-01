import { describe, expect, it } from 'vitest';

import { cn, convertSessionToPlainObject, escapeRegExp, toPlainObject } from '../utils';

describe('escapeRegExp', () => {
  // 감사 3.28: 조직도 검색이 원시 입력으로 RegExp 를 만들어 '(' 하나에 페이지가 크래시했다.
  it.each(['(', ')', '[', ']', '{', '}', '*', '+', '?', '^', '$', '.', '|', '\\'])(
    "정규식 메타문자 '%s' 를 이스케이프해 RegExp 생성이 throw 하지 않게 한다",
    (meta) => {
      expect(() => new RegExp(escapeRegExp(meta))).not.toThrow();
      expect(new RegExp(escapeRegExp(meta)).test(meta)).toBe(true);
    }
  );

  it('메타문자를 리터럴로 매칭한다 (와일드카드로 해석하지 않는다)', () => {
    expect(new RegExp(escapeRegExp('a.c')).test('abc')).toBe(false);
    expect(new RegExp(escapeRegExp('a.c')).test('a.c')).toBe(true);
  });

  it('일반 문자열은 그대로 둔다', () => {
    expect(escapeRegExp('홍길동')).toBe('홍길동');
    expect(escapeRegExp('acme-corp')).toBe('acme-corp');
  });

  it('여러 메타문자가 섞인 실제 입력도 안전하게 처리한다', () => {
    const query = '(주)한국 [본사] *';
    expect(() => new RegExp(`(${escapeRegExp(query)})`, 'gi')).not.toThrow();
    expect(new RegExp(escapeRegExp(query), 'i').test(`문의: ${query} 담당`)).toBe(true);
  });
});

describe('utils', () => {
  it('cn 함수는 클래스 이름을 병합한다', () => {
    expect(cn('p-4', 'text-sm', { hidden: false, visible: true })).toBe('p-4 text-sm visible');
    expect(cn('p-4', undefined, null)).toBe('p-4');
  });

  it('toPlainObject는 Date와 배열을 포함한 객체를 순수 객체로 만든다', () => {
    const input = {
      id: 1,
      name: 'Test',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      tags: ['a', 'b'],
      meta: {
        flags: [true, false],
      },
    };

    const result = toPlainObject(input);

    expect(result).toEqual({
      id: 1,
      name: 'Test',
      createdAt: '2025-01-01T00:00:00.000Z',
      tags: ['a', 'b'],
      meta: { flags: [true, false] },
    });

    // 원본 객체를 변형하지 않아야 한다
    expect(input.createdAt).toBeInstanceOf(Date);
  });

  it('toPlainObject는 원시값을 그대로 반환한다', () => {
    expect(toPlainObject(1)).toBe(1);
    expect(toPlainObject('text')).toBe('text');
    expect(toPlainObject(null)).toBeNull();
  });

  it('convertSessionToPlainObject는 세션이 없을 때 undefined를 반환한다', () => {
    expect(convertSessionToPlainObject(null as any)).toBeUndefined();
    expect(convertSessionToPlainObject({} as any)).toBeUndefined();
  });

  it('convertSessionToPlainObject는 세션 유저를 순수 객체로 변환한다', () => {
    const session = {
      user: {
        id: 'user-1',
        name: '홍길동',
        email: 'test@example.com',
        image: 'img',
        roles: ['ADMIN'],
        permissions: ['sr.view'],
      },
    };

    expect(convertSessionToPlainObject(session)).toEqual(session.user);
  });
  it('toPlainObject는 복잡한 중첩 객체와 Edge Case를 처리한다', () => {
    const input = {
      a: {
        b: new Date('2025-01-01T00:00:00.000Z'),
        c: [1, new Date('2025-01-01T00:00:00.000Z')],
      },
      d: null,
      e: undefined,
    };

    const result = toPlainObject(input);

    expect(result).toEqual({
      a: {
        b: '2025-01-01T00:00:00.000Z',
        c: [1, '2025-01-01T00:00:00.000Z'],
      },
      d: null,
      e: undefined,
    });
  });
});
