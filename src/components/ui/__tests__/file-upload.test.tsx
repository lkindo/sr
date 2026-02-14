import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FileUpload } from '../file-upload';

describe('FileUpload', () => {
  it('renders with accessible remove buttons', () => {
    const file = new File(['hello'], 'hello.png', { type: 'image/png' });
    const onChange = vi.fn();

    render(<FileUpload value={[file]} onChange={onChange} />);

    // This checks if there is a button with the specific aria-label
    // The label text follows the Korean format "filename 삭제"
    const removeButton = screen.getByLabelText('hello.png 삭제');
    expect(removeButton).toBeInTheDocument();
  });

  it('renders a hidden file input', () => {
    const onChange = vi.fn();
    render(<FileUpload value={[]} onChange={onChange} />);

    // The input should be present but hidden
    // We can find it by its type attribute or by querying the container
    const input = document.querySelector('input[type="file"]');
    expect(input).toBeInTheDocument();
    expect(input).toHaveClass('opacity-0');
  });

  it('accepts pasted files', () => {
    const onChange = vi.fn();
    render(<FileUpload value={[]} onChange={onChange} />);

    const file = new File(['paste content'], 'paste.png', { type: 'image/png' });
    const clipboardData = {
      files: [file],
      types: ['Files'],
      getData: () => '',
    };

    const container = document.querySelector('.border-dashed');
    expect(container).toBeInTheDocument();

    fireEvent.paste(container!, { clipboardData });

    expect(onChange).toHaveBeenCalled();
    const callArgs = onChange.mock.calls[0][0];
    expect(callArgs).toHaveLength(1);
    expect(callArgs[0].name).toBe('paste.png');
  });
});
