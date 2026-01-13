import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Checkbox } from '../checkbox';
import { RadioGroup, RadioGroupItem } from '../radio-group';
import { Switch } from '../switch';
import { Textarea } from '../textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../select';

describe('Form Components', () => {
    describe('Checkbox', () => {
        it('renders and accepts checked state', () => {
            render(<Checkbox checked={true} />);
            const checkbox = screen.getByRole('checkbox');
            expect(checkbox).toBeInTheDocument();
            expect(checkbox).toHaveAttribute('data-state', 'checked');
        });
    });

    describe('RadioGroup', () => {
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

    describe('Switch', () => {
        it('renders switch toggle', () => {
            render(<Switch checked={true} />);
            const switchEl = screen.getByRole('switch');
            expect(switchEl).toBeInTheDocument();
            expect(switchEl).toHaveAttribute('data-state', 'checked');
        });
    });

    describe('Textarea', () => {
        it('renders textarea', () => {
            render(<Textarea placeholder="Type here" />);
            const area = screen.getByPlaceholderText('Type here');
            expect(area).toBeInTheDocument();
            expect(area.tagName).toBe('TEXTAREA');
        });
    });

    // Select is complex (Radix), basic render check
    describe('Select', () => {
        it('renders trigger', () => {
            render(
                <Select>
                    <SelectTrigger>
                        <SelectValue placeholder="Select option" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="1">Option 1</SelectItem>
                    </SelectContent>
                </Select>
            );
            expect(screen.getByText('Select option')).toBeInTheDocument();
            const trigger = screen.getByRole('combobox');
            expect(trigger).toBeInTheDocument();
        });
    });
});
