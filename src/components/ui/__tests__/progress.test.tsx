import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Progress } from '../progress';

describe('Progress Component', () => {
  it('renders progress bar with role', () => {
    render(<Progress value={50} />);
    const progress = screen.getByRole('progressbar');
    expect(progress).toBeInTheDocument();
  });

  it('renders with 0 value', () => {
    const { container } = render(<Progress value={0} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders with 100 value', () => {
    const { container } = render(<Progress value={100} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<Progress value={75} className="custom-progress" />);
    expect(container.firstChild).toHaveClass('custom-progress');
  });
});
