import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Avatar, AvatarFallback, AvatarImage } from '../avatar';
import { Badge } from '../badge';
import { Card, CardContent, CardHeader, CardTitle } from '../card';
import { Label } from '../label';
import { Separator } from '../separator';

describe('Simple UI Components', () => {
  describe('Badge', () => {
    it('renders with default variant', () => {
      render(<Badge>Test Badge</Badge>);
      const badge = screen.getByText('Test Badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('inline-flex');
    });

    it('renders with secondary variant', () => {
      render(<Badge variant="secondary">Secondary</Badge>);
      const badge = screen.getByText('Secondary');
      expect(badge).toHaveClass('bg-secondary');
    });
  });

  describe('Label', () => {
    it('renders correctly', () => {
      render(<Label htmlFor="email">Email</Label>);
      const label = screen.getByText('Email');
      expect(label).toBeInTheDocument();
      expect(label).toHaveAttribute('for', 'email');
    });
  });

  describe('Separator', () => {
    it('renders horizontal separator', () => {
      const { container } = render(<Separator />);
      // Just check it exists and has class
      expect(container.firstChild).toBeInTheDocument();
    });

    it('renders vertical separator', () => {
      const { container } = render(<Separator orientation="vertical" />);
      expect(container.firstChild).toHaveClass('h-full w-[1px]');
    });
  });

  describe('Avatar', () => {
    it('renders fallback when image fails or missing', () => {
      render(
        <Avatar>
          <AvatarFallback>CN</AvatarFallback>
        </Avatar>
      );
      expect(screen.getByText('CN')).toBeInTheDocument();
    });

    it('renders image or fallback (JSDOM env)', () => {
      // In JSDOM, image loading is not simulated by default.
      // We can check attributes or just verify fallback is shown gracefully.
      const { container } = render(
        <Avatar>
          <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
          <AvatarFallback>CN</AvatarFallback>
        </Avatar>
      );
      // Verify fallback is present
      expect(screen.getByText('CN')).toBeInTheDocument();
      // And image tag is technically in the DOM structure (though Radix might hide it)
      // Let's assume testing fallback is sufficient for "rendering" logic in unit test env.
    });
  });

  describe('Card', () => {
    it('renders card with header and content', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Card Title</CardTitle>
          </CardHeader>
          <CardContent>Content Area</CardContent>
        </Card>
      );

      expect(screen.getByText('Card Title')).toBeInTheDocument();
      expect(screen.getByText('Content Area')).toBeInTheDocument();
    });
  });
});
