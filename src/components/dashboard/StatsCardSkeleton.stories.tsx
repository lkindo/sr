import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { StatsCardSkeleton } from './StatsCardSkeleton';

// StatsCard 본체는 렌더링하는 곳이 없어 Phase 1 에서 삭제했지만, 스켈레톤은
// DashboardSkeleton.tsx 가 4회 렌더하는 살아 있는 컴포넌트다. StatsCard.stories.tsx 의
// LoadingSkeleton 스토리를 이 파일로 옮겨 로딩 상태의 시각 회귀 커버리지를 유지한다.
const meta: Meta<typeof StatsCardSkeleton> = {
  title: 'Dashboard/StatsCardSkeleton',
  component: StatsCardSkeleton,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof StatsCardSkeleton>;

export const Default: Story = {
  name: 'Loading State (Skeleton)',
};
