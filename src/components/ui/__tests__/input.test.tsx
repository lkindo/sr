import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Input } from '../input';

describe('Input', () => {
  it('should render correctly', () => {
    render(<Input placeholder="Enter text" />);
    const input = screen.getByPlaceholderText('Enter text');
    expect(input).toBeInTheDocument();
  });

  it('should apply custom classes', () => {
    render(<Input className="custom-input" />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveClass('custom-input');
  });

  it('should handle different types', () => {
    const types = ['text', 'password', 'email', 'number'] as const;
    types.forEach((type) => {
      const { unmount } = render(<Input type={type} placeholder={type} />);
      const input = screen.getByPlaceholderText(type);
      expect(input).toHaveAttribute('type', type);
      unmount();
    });
  });

  it('should forward ref', () => {
    const ref = React.createRef<HTMLInputElement>();
    render(<Input ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('should handle disabled state', () => {
    render(<Input disabled />);
    const input = screen.getByRole('textbox');
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute('disabled');
  });

  it('should call onChange handler when typed', () => {
    const handleChange = vi.fn();
    render(<Input onChange={handleChange} />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: 'searched' } });
    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue('searched');
  });
});
