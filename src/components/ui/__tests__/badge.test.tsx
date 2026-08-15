import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Badge, badgeVariants } from '../badge';

describe('Badge Component', () => {
  it('renders with default variant', () => {
    render(<Badge>Default Badge</Badge>);
    expect(screen.getByText('Default Badge')).toBeInTheDocument();
  });

  it('renders with secondary variant', () => {
    render(<Badge variant="secondary">Secondary</Badge>);
    const badge = screen.getByText('Secondary');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-secondary');
  });

  it('renders with destructive variant', () => {
    render(<Badge variant="destructive">Destructive</Badge>);
    const badge = screen.getByText('Destructive');
    expect(badge).toBeInTheDocument();
    // 배경은 투명도를 낀 옅은 채움이고 글자가 destructive 색이다.
    // 예전에는 `bg-destructive text-destructive`(같은 색 = 판독 불가)를 cva 가 내고,
    // Badge() 가 cn() 밖에서 `bg-destructive/10` 을 덧붙여 겨우 읽히게 만들고 있었다.
    // 그 방식은 tailwind-merge 를 우회하므로 두 배경 클래스가 동시에 살아남았다.
    expect(badge).toHaveClass('bg-destructive/10');
    expect(badge).toHaveClass('text-destructive');
    expect(badge).not.toHaveClass('bg-destructive');
  });

  it('renders with outline variant', () => {
    render(<Badge variant="outline">Outline</Badge>);
    const badge = screen.getByText('Outline');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('text-foreground');
  });

  it('applies custom className', () => {
    render(<Badge className="custom-class">Custom</Badge>);
    const badge = screen.getByText('Custom');
    expect(badge).toHaveClass('custom-class');
  });

  it('badgeVariants returns correct class string', () => {
    const classes = badgeVariants({ variant: 'default' });
    expect(classes).toContain('bg-primary');
  });
});
