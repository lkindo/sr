import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PasswordInput } from '../password-input';

describe('PasswordInput', () => {
  it('should render correctly', () => {
    render(<PasswordInput placeholder="Enter password" />);
    const input = screen.getByPlaceholderText('Enter password');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'password');
  });

  it('should toggle password visibility', () => {
    render(<PasswordInput placeholder="Enter password" />);
    const input = screen.getByPlaceholderText('Enter password');

    // Initial state: password hidden
    expect(input).toHaveAttribute('type', 'password');

    const toggleButton = screen.getByRole('button', { name: /비밀번호 표시/i });

    // Click toggle button
    fireEvent.click(toggleButton);

    // Password should be visible
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: /비밀번호 숨기기/i })).toBeInTheDocument();

    // Click again
    fireEvent.click(toggleButton);

    // Password should be hidden again
    expect(input).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: /비밀번호 표시/i })).toBeInTheDocument();
  });

  it('should forward ref', () => {
    const ref = React.createRef<HTMLInputElement>();
    render(<PasswordInput ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('should handle disabled state', () => {
    render(<PasswordInput placeholder="Disabled" disabled />);
    const input = screen.getByPlaceholderText('Disabled');
    expect(input).toBeDisabled();

    const toggleButton = screen.getByRole('button');
    expect(toggleButton).toBeDisabled();
  });

  it('should call onChange handler', () => {
    const handleChange = vi.fn();
    render(<PasswordInput placeholder="Type here" onChange={handleChange} />);
    const input = screen.getByPlaceholderText('Type here');

    fireEvent.change(input, { target: { value: 'secret' } });
    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue('secret');
  });
});
