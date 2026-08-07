import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Label } from '../label';

describe('Label Component', () => {
  it('renders correctly', () => {
    render(<Label htmlFor="email">Email</Label>);
    const label = screen.getByText('Email');
    expect(label).toBeInTheDocument();
    expect(label).toHaveAttribute('for', 'email');
  });
});
