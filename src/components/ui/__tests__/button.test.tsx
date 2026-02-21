import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '../button';

describe('Button', () => {
  it('should render correctly', () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole('button', { name: /click me/i });
    expect(button).toBeInTheDocument();
  });

  describe('Variants', () => {
    const variants = ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'] as const;

    variants.forEach((variant) => {
      it(`should render ${variant} variant correctly`, () => {
        render(<Button variant={variant}>{variant}</Button>);
        const button = screen.getByRole('button', { name: variant });
        expect(button).toBeInTheDocument();
        // 각 variant별 클래스 확인은 shadcn 구현에 의존적이므로 렌더링 여부와 기본 동작 위주로 확인
        if (variant === 'destructive') {
          expect(button).toHaveClass('bg-destructive');
        }
      });
    });
  });

  describe('Sizes', () => {
    const sizes = ['default', 'sm', 'lg', 'icon'] as const;

    sizes.forEach((size) => {
      it(`should render ${size} size correctly`, () => {
        render(<Button size={size}>{size}</Button>);
        const button = screen.getByRole('button', { name: size });
        expect(button).toBeInTheDocument();
        if (size === 'sm') {
          expect(button).toHaveClass('h-8');
        }
      });
    });
  });

  it('should merge custom classes', () => {
    render(<Button className="custom-class">Custom</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('custom-class');
  });

  it('should support asChild prop', () => {
    render(
      <Button asChild>
        <a href="/link">Link Button</a>
      </Button>
    );
    const link = screen.getByRole('link', { name: /link button/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveClass('inline-flex');
  });

  it('should handle disabled state', () => {
    render(<Button disabled>Disabled</Button>);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveClass('disabled:opacity-50');
  });

  it('should handle click events', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click Me</Button>);
    const button = screen.getByRole('button', { name: /click me/i });
    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should show loading spinner and be disabled when isLoading is true', () => {
    render(<Button isLoading>Loading</Button>);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Loading');
    // Check if Loader2 is present (it renders an svg)
    const svg = button.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveClass('animate-spin');
  });

  it('should not show loading spinner when asChild is true even if isLoading is true', () => {
    render(
      <Button asChild isLoading>
        <a href="/link">Link Button</a>
      </Button>
    );
    const link = screen.getByRole('link', { name: /link button/i });
    expect(link).toBeInTheDocument();
    // Should verify that the spinner is NOT present inside the link
    const svg = link.querySelector('svg');
    expect(svg).not.toBeInTheDocument();
  });
});
