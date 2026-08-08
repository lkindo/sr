import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RadioGroup, RadioGroupItem } from '../radio-group';

describe('RadioGroup Component', () => {
  it('renders radio items', () => {
    render(
      <RadioGroup defaultValue="option-one">
        <RadioGroupItem value="option-one" id="option-one" />
        <RadioGroupItem value="option-two" id="option-two" />
      </RadioGroup>
    );
    const radio1 = screen.getAllByRole('radio')[0];
    expect(radio1).toBeInTheDocument();
    expect(radio1).toHaveAttribute('data-state', 'checked');
  });
});
