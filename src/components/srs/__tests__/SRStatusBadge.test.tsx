import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SRStatusBadge } from '../SRStatusBadge';

/**
 * SR 상태 배지(2026-09-18 소유자 결정 D16 2단계). 모든 화면이 이 컴포넌트로 상태를 그린다 — 색은 정본 맵,
 * 라벨은 statusLabelOf 다. 확인완료만 체크 아이콘을 더한다.
 */
describe('SRStatusBadge', () => {
  it('확인완료는 완료와 같은 초록에 테두리와 체크 아이콘을 더한다', () => {
    const { container } = render(<SRStatusBadge status="CONFIRMED" />);

    const badge = screen.getByText('확인완료');
    expect(badge).toHaveClass('text-status-success', 'border-status-success/45');
    // 아이콘은 장식이다 — 읽는 이름은 라벨뿐이다.
    const icon = container.querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('완료에는 아이콘이 없다', () => {
    const { container } = render(<SRStatusBadge status="COMPLETED" />);

    expect(screen.getByText('완료')).toHaveClass('text-status-success');
    expect(container.querySelector('svg')).toBeNull();
  });

  it('모르는 상태 코드는 코드 그대로 색 없는 테두리로 보인다(숨기지 않는다)', () => {
    render(<SRStatusBadge status="ESCALATED" />);

    expect(screen.getByText('ESCALATED')).toHaveClass('text-status-neutral');
  });

  it('data-testid·className 을 배지에 그대로 넘긴다', () => {
    render(<SRStatusBadge status="IN_PROGRESS" data-testid="sr-status-badge" className="h-5" />);

    const badge = screen.getByTestId('sr-status-badge');
    expect(badge).toHaveTextContent('진행중');
    expect(badge).toHaveClass('h-5', 'text-status-info');
  });
});
