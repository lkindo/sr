import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Separator } from '../separator';

describe('Separator Component', () => {
  it('renders horizontal separator', () => {
    const { container } = render(<Separator />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders vertical separator', () => {
    const { container } = render(<Separator orientation="vertical" />);
    expect(container.firstChild).toHaveClass('h-full w-[1px]');
  });
});
