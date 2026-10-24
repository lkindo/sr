import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Progress } from '../progress';

describe('Progress Component', () => {
  it('renders progress bar with role', () => {
    render(<Progress value={50} aria-label="요청 진행률" />);
    const progress = screen.getByRole('progressbar', { name: '요청 진행률' });
    expect(progress).toBeInTheDocument();
    expect(progress).toHaveAttribute('aria-valuenow', '50');
  });

  it('renders with 0 value', () => {
    render(<Progress value={0} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('renders with 100 value', () => {
    render(<Progress value={100} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  it('applies custom className', () => {
    const { container } = render(<Progress value={75} className="custom-progress" />);
    expect(container.firstChild).toHaveClass('custom-progress');
  });
});
