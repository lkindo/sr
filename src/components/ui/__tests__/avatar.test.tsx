import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Avatar, AvatarFallback, AvatarImage } from '../avatar';

describe('Avatar Component', () => {
  it('renders fallback when image fails or missing', () => {
    render(
      <Avatar>
        <AvatarFallback>CN</AvatarFallback>
      </Avatar>
    );
    expect(screen.getByText('CN')).toBeInTheDocument();
  });

  it('renders image or fallback (JSDOM env)', () => {
    render(
      <Avatar>
        <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
        <AvatarFallback>CN</AvatarFallback>
      </Avatar>
    );
    expect(screen.getByText('CN')).toBeInTheDocument();
  });
});
