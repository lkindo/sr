import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Skeleton } from '../skeleton';

describe('Skeleton Component', () => {
  it('renders with default class', () => {
    const { container } = render(<Skeleton />);
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton).toHaveClass('animate-pulse');
  });

  it('applies custom className', () => {
    const { container } = render(<Skeleton className="h-4 w-full" />);
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton).toHaveClass('h-4');
    expect(skeleton).toHaveClass('w-full');
  });
});
