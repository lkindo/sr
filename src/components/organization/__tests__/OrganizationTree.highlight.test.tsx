import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Client, OrganizationTree, User } from '../OrganizationTree';

/**
 * 감사 3.28 회귀 테스트.
 *
 * `highlightText` 가 검색어를 이스케이프하지 않고 `new RegExp("(" + query + ")")` 로
 * 넘기던 시절에는 '(' 한 글자만 입력해도 렌더 도중 SyntaxError 가 던져져
 * 조직도 페이지 전체가 크래시했다.
 */

const client: Client = {
  id: 'client-1',
  code: 'ACME',
  name: '(주)에이스',
  industry: 'IT',
  isActive: true,
  _count: { users: 1, srs: 0 },
};

const user: User = {
  id: 'user-1',
  name: '홍길동',
  email: 'hong@example.com',
  isActive: true,
  roles: [{ role: { name: 'ENGINEER' } }],
};

function renderTree(searchQuery: string) {
  return render(
    <OrganizationTree
      clients={[client]}
      expandedClients={new Set(['client-1'])}
      clientUsers={{ 'client-1': [user] }}
      onToggleClient={vi.fn()}
      onAddUser={vi.fn()}
      searchQuery={searchQuery}
    />
  );
}

describe('OrganizationTree 검색어 하이라이트', () => {
  // 이스케이프 이전에는 이 목록 전부가 "Invalid regular expression" 으로 크래시했다.
  const metacharacters = ['(', ')', '[', '*', '+', '?', '{', '\\', '(주)', 'a|b', '^$'];

  it.each(metacharacters)("검색어 '%s' 를 입력해도 크래시하지 않는다", (query) => {
    expect(() => renderTree(query)).not.toThrow();
  });

  it('정규식 메타문자를 포함한 검색어도 렌더 결과에 고객사명을 유지한다', () => {
    renderTree('(');
    expect(screen.getByText(/에이스/)).toBeInTheDocument();
  });

  it('일반 검색어는 일치 구간을 mark 로 강조한다', () => {
    const { container } = renderTree('홍길동');
    const marks = container.querySelectorAll('mark');
    expect(marks.length).toBeGreaterThan(0);
    expect(Array.from(marks).map((m) => m.textContent)).toContain('홍길동');
  });

  it('메타문자를 와일드카드가 아니라 리터럴로 취급한다', () => {
    // '.' 이 임의 문자로 해석되면 '홍길동' 의 아무 두 글자나 강조된다.
    const { container } = renderTree('..');
    expect(container.querySelectorAll('mark')).toHaveLength(0);
  });
});
