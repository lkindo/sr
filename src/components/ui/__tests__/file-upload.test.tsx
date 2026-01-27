import { render, screen } from '@testing-library/react';
import { FileUpload } from '../file-upload';
import { vi, describe, it, expect } from 'vitest';

describe('FileUpload', () => {
  it('renders with accessible remove buttons', () => {
    const file = new File(['hello'], 'hello.png', { type: 'image/png' });
    const onChange = vi.fn();

    render(
      <FileUpload
        value={[file]}
        onChange={onChange}
      />
    );

    // This checks if there is a button with the specific aria-label
    // The label text follows the Korean format "filename 삭제"
    const removeButton = screen.getByLabelText('hello.png 삭제');
    expect(removeButton).toBeInTheDocument();
  });
});
