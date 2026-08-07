import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Switch } from '../switch';

describe('Switch Component', () => {
  it('renders switch toggle', () => {
    render(<Switch checked={true} />);
    const switchEl = screen.getByRole('switch');
    expect(switchEl).toBeInTheDocument();
    expect(switchEl).toHaveAttribute('data-state', 'checked');
  });
});
