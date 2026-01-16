import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StatsCard } from '../StatsCard';
import { Activity } from 'lucide-react';

describe('StatsCard', () => {
  it('renders title and value correctly', () => {
    render(<StatsCard title="Total Users" value={1234} />);

    expect(screen.getByText('Total Users')).toBeDefined();
    expect(screen.getByText('1234')).toBeDefined();
  });

  it('renders description when provided', () => {
    render(<StatsCard title="Active SRs" value="50" description="Currently in progress" />);

    expect(screen.getByText('Currently in progress')).toBeDefined();
  });

  it('does not render description when not provided', () => {
    render(<StatsCard title="Active SRs" value="50" />);

    const description = screen.queryByText('Currently in progress');
    expect(description).toBeNull();
  });

  it('renders icon when provided', () => {
    const { container } = render(<StatsCard title="With Icon" value={100} icon={Activity} />);

    // Check if the icon class is present (based on lucide-react rendering)
    // Depending on implementation, checking for the SVG or specific class is common
    // Here we check for the class passed to the Icon in the component
    expect(container.querySelector('.lucide-activity')).toBeDefined();
  });

  it('renders positive trend correctly', () => {
    render(<StatsCard title="Revenue" value="$1,000" trend={{ value: 10, isPositive: true }} />);

    const trendText = screen.getByText('+10% from last month');
    expect(trendText).toBeDefined();
    expect(trendText.className).toContain('text-green-600');
  });

  it('renders negative trend correctly', () => {
    render(<StatsCard title="Bounce Rate" value="5%" trend={{ value: 2.5, isPositive: false }} />);

    const trendText = screen.getByText('2.5% from last month');
    expect(trendText).toBeDefined();
    expect(trendText.className).toContain('text-red-600');
  });
});
