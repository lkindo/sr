import type { Meta, StoryObj } from '@storybook/nextjs';
import { Activity, DollarSign, TrendingUp, Users } from 'lucide-react';

import { StatsCard } from './StatsCard';
import { StatsCardSkeleton } from './StatsCardSkeleton';

const meta: Meta<typeof StatsCard> = {
  title: 'Dashboard/StatsCard',
  component: StatsCard,
  tags: ['autodocs'],
  argTypes: {
    icon: { control: false }, // Icons are complex objects, disable control ensuring no error
  },
};

export default meta;
type Story = StoryObj<typeof StatsCard>;

export const Default: Story = {
  args: {
    title: 'Total Users',
    value: '1,234',
    description: 'Active users in the system',
  },
};

export const WithIcon: Story = {
  args: {
    title: 'Revenue',
    value: '$45,231.89',
    icon: DollarSign,
    description: '+20.1% from last month',
  },
};

export const PositiveTrend: Story = {
  args: {
    title: 'Active Now',
    value: '573',
    icon: Activity,
    trend: {
      value: 12,
      isPositive: true,
    },
  },
};

export const NegativeTrend: Story = {
  args: {
    title: 'Churn Rate',
    value: '2.4%',
    icon: Users,
    trend: {
      value: 0.5,
      isPositive: false,
    },
  },
};

export const LoadingSkeleton: Story = {
  render: () => <StatsCardSkeleton />,
  name: 'Loading State (Skeleton)',
};
