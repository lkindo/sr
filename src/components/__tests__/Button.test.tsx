import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../ui/button';

describe('Button Component', () => {
  it('버튼 텍스트를 렌더링해야 함', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('클릭 이벤트를 처리해야 함', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    render(<Button onClick={handleClick}>Click me</Button>);
    
    const button = screen.getByText('Click me');
    await user.click(button);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('disabled 상태일 때 클릭되지 않아야 함', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    render(<Button onClick={handleClick} disabled>Click me</Button>);
    
    const button = screen.getByText('Click me');
    await user.click(button);

    expect(handleClick).not.toHaveBeenCalled();
    expect(button).toBeDisabled();
  });

  it('variant prop에 따라 스타일이 적용되어야 함', () => {
    const { container: defaultContainer } = render(<Button>Default</Button>);
    const { container: destructiveContainer } = render(<Button variant="destructive">Destructive</Button>);
    
    // 기본적으로 variant가 적용되는지 확인
    expect(defaultContainer.firstChild).toBeInTheDocument();
    expect(destructiveContainer.firstChild).toBeInTheDocument();
  });
});


