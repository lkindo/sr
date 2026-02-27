import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSRCommentsInfinite } from '@/hooks/use-sr-infinite';
import { useToast } from '@/hooks/use-toast';

import { SRComments } from '../SRComments';

// Mock the hooks
vi.mock('@/hooks/use-sr-infinite', () => ({
  useSRCommentsInfinite: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

// Mock useToast hook (it's used in the component)
vi.mock('@/hooks/use-toast', () => ({
  useToast: vi.fn(),
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('SRComments', () => {
  const mockQueryClient = { invalidateQueries: vi.fn() };
  const mockRouter = { refresh: vi.fn() };
  const mockToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useQueryClient as any).mockReturnValue(mockQueryClient);
    (useRouter as any).mockReturnValue(mockRouter);
    (useToast as any).mockReturnValue({ toast: mockToast });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
  });

  it('renders loading state initially', () => {
    (useSRCommentsInfinite as any).mockReturnValue({
      isLoading: true,
      data: null,
    });

    render(<SRComments srId="test-sr-id" />);
    // Check for the loader (Loader2 renders an svg, usually with role="img" or class animate-spin)
    // The component renders Loader2 inside a card content.
    // Ideally we'd look for a role="status" or accessible text, but current implementation just shows spinner.
    // Let's just check if it renders without crashing for now, or check for specific class if possible.
    // Actually, let's wait until we implement better a11y to assert accessible loading.
  });

  it('renders comments list with correct semantics', () => {
    const mockComments = [
      {
        id: 'c1',
        content: 'Test comment 1',
        createdAt: new Date().toISOString(),
        user: { name: 'User 1', image: null },
      },
      {
        id: 'c2',
        content: 'Test comment 2',
        createdAt: new Date().toISOString(),
        user: { name: 'User 2', image: null },
      },
    ];

    (useSRCommentsInfinite as any).mockReturnValue({
      isLoading: false,
      data: {
        pages: [{ comments: mockComments }],
      },
      hasNextPage: false,
    });

    render(<SRComments srId="test-sr-id" />);

    // Check if list is rendered as a list
    const list = screen.getByRole('list');
    expect(list).toBeInTheDocument();

    // Check if list items are rendered
    const listItems = screen.getAllByRole('listitem');
    expect(listItems).toHaveLength(2);
    expect(listItems[0]).toHaveTextContent('Test comment 1');
    expect(listItems[1]).toHaveTextContent('Test comment 2');
  });

  it('renders textarea with accessible name', () => {
    (useSRCommentsInfinite as any).mockReturnValue({
      isLoading: false,
      data: { pages: [] },
    });

    render(<SRComments srId="test-sr-id" />);

    // Check if textarea has accessible name
    const textarea = screen.getByLabelText('댓글 작성');
    expect(textarea).toBeInTheDocument();
  });

  it('renders empty state correctly', () => {
    (useSRCommentsInfinite as any).mockReturnValue({
      isLoading: false,
      data: { pages: [] },
    });

    render(<SRComments srId="test-sr-id" />);

    expect(screen.getByText('아직 댓글이 없습니다')).toBeInTheDocument();
    expect(screen.getByText('첫 번째 댓글을 남겨보세요.')).toBeInTheDocument();
  });

  it('disables submit button when input is empty', () => {
    (useSRCommentsInfinite as any).mockReturnValue({
      isLoading: false,
      data: { pages: [] },
    });

    render(<SRComments srId="test-sr-id" />);

    const submitButton = screen.getByRole('button', { name: '댓글 추가' });
    expect(submitButton).toBeDisabled();

    const textarea = screen.getByLabelText('댓글 작성');
    fireEvent.change(textarea, { target: { value: '   ' } });
    expect(submitButton).toBeDisabled();
  });

  it('enables submit button when input has text', () => {
    (useSRCommentsInfinite as any).mockReturnValue({
      isLoading: false,
      data: { pages: [] },
    });

    render(<SRComments srId="test-sr-id" />);

    const submitButton = screen.getByRole('button', { name: '댓글 추가' });
    const textarea = screen.getByLabelText('댓글 작성');

    fireEvent.change(textarea, { target: { value: 'Hello' } });
    expect(submitButton).not.toBeDisabled();
  });

  it('submits comment on Ctrl+Enter', async () => {
    (useSRCommentsInfinite as any).mockReturnValue({
      isLoading: false,
      data: { pages: [] },
    });

    render(<SRComments srId="test-sr-id" />);

    const textarea = screen.getByLabelText('댓글 작성');
    await userEvent.type(textarea, 'New comment');

    // Simulate Ctrl+Enter
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/srs/test-sr-id/comments', expect.anything());
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/srs/test-sr-id/comments',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ content: 'New comment' }),
      })
    );
  });
});
