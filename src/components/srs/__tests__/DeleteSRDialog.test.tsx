import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DeleteSRDialog } from '../DeleteSRDialog';

// Radix 의 Dialog 는 포털·포인터 이벤트를 요구해 jsdom 에서 테스트를 라이브러리 구현에
// 묶는다. 여기서 볼 것은 고지 문구이지 Radix 의 렌더가 아니다.
vi.mock('@/components/ui', async () => (await import('@/__tests__/mocks/ui-primitives')).uiMock());

/**
 * SR 삭제 확인 다이얼로그의 **고지 문구**.
 *
 * SR 삭제는 2026-08-15 부터 논리 삭제다(`.gemini/rules/db-rules.md` §2). 댓글·첨부·이력은
 * 지워지지 않고 남는다. 그런데 이 다이얼로그는 그 뒤로도 "모든 댓글과 첨부파일도 함께
 * 삭제됩니다" 라고 말했다 — 문서를 한 줄도 읽지 않은 운영자도 삭제 버튼만 누르면 보는
 * 문장이 사실과 반대였다. 그 말을 믿고 개인정보 삭제 요청을 이 버튼으로 종결하면 실제
 * 데이터는 남는다.
 */
describe('DeleteSRDialog — 고지 문구', () => {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    sr: { id: 'sr-1', srNumber: 'SR-20260918-0001', title: '로그인 오류' },
    onDelete: vi.fn(),
  };

  it('댓글·첨부·이력이 보관된다고 사실대로 알린다', () => {
    render(<DeleteSRDialog {...props} />);

    expect(
      screen.getByText(/댓글·첨부파일·처리 이력은 감사 기록으로 보관됩니다/)
    ).toBeInTheDocument();
  });

  it('댓글·첨부가 함께 삭제된다고 말하지 않는다', () => {
    render(<DeleteSRDialog {...props} />);

    expect(screen.queryByText(/함께 삭제/)).not.toBeInTheDocument();
  });
});
