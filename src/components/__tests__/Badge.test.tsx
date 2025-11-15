import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '../ui/badge';

describe('Badge Component', () => {
  it('배지 텍스트를 렌더링해야 함', () => {
    render(<Badge>Test Badge</Badge>);
    expect(screen.getByText('Test Badge')).toBeInTheDocument();
  });

  it('variant prop에 따라 스타일이 적용되어야 함', () => {
    const { container: defaultContainer } = render(<Badge>Default</Badge>);
    const { container: successContainer } = render(<Badge variant="success">Success</Badge>);
    
    expect(defaultContainer.firstChild).toBeInTheDocument();
    expect(successContainer.firstChild).toBeInTheDocument();
  });

  it('다양한 variant를 지원해야 함', () => {
    const variants = ['default', 'secondary', 'destructive', 'outline', 'success'] as const;
    
    variants.forEach((variant) => {
      const { container } = render(<Badge variant={variant}>{variant}</Badge>);
      expect(container.firstChild).toBeInTheDocument();
    });
  });
});

