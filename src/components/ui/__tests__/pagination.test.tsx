import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '../pagination';

describe('Pagination Component', () => {
  it('renders Pagination with correct aria-label', () => {
    render(<Pagination />);
    expect(screen.getByRole('navigation', { name: /페이지 탐색/i })).toBeInTheDocument();
  });

  it('renders PaginationPrevious with correct aria-label', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="#" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );
    expect(screen.getByRole('link', { name: /이전 페이지로 이동/i })).toBeInTheDocument();
  });

  it('renders PaginationNext with correct aria-label', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationNext href="#" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );
    expect(screen.getByRole('link', { name: /다음 페이지로 이동/i })).toBeInTheDocument();
  });

  it('renders PaginationEllipsis with correct sr-only text', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );
    // screen.getByText finds the hidden text as well if we don't specify { ignore: 'script, style' } which is default
    // However, sr-only is visually hidden but accessible.
    // getByText queries the accessibility tree or DOM content depending on config.
    // Let's use a more specific query if needed, but getByText works for sr-only text in testing-library
    expect(screen.getByText('생략된 페이지')).toBeInTheDocument();
  });
});
