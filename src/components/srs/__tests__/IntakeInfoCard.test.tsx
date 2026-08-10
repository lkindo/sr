import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { SRDetails } from '@/types/sr.types';

import { IntakeInfoCard } from '../IntakeInfoCard';

/**
 * 접수 정보 카드.
 *
 * 훅도 서버 호출도 없는 순수 표현 컴포넌트라 목이 없다. 실물 `Badge` 를 쓰는 이유는
 * 우선순위별 배지색과 "변경됨" ring 을 클래스로 단언하기 위해서다.
 *
 * 이 화면의 판정은 전부 **표시할지 말지**다:
 *   - 상태 화이트리스트(5종) / 그 밖(REQUESTED·REJECTED)
 *   - `intakeAt` 유무 — 화이트리스트에 들어도 접수 시각이 없으면 통째로 감춘다
 *     (그 가드 덕에 카드 안에서는 접수 시각이 늘 있다. 예전에 값 자리에 있던
 *      `? ... : 'N/A'` 삼항은 false 가지가 도달 불가라 2026-08-10 에 걷어냈다 —
 *      이 그룹의 감춤 테스트들이 그 전제를 지킨다.)
 *   - `requestedPriority !== actualPriority` (변경됨 표시)
 *   - `actualPriority` / `estimatedHours` / `estimatedCompletionDate` / `intakeNotes` 의 유무
 *   - `intakeBy` 가 없을 때의 'N/A' 폴백
 */

/**
 * 화면이 읽는 필드만 담은 픽스처.
 *
 * 실제로 이 컴포넌트에 오는 `sr` 은 서버 컴포넌트에서 직렬화를 거친 값이라
 * `Decimal` 은 숫자, `DateTime` 은 문자열이 될 수 있다 — 타입 선언(`SRDetails`)보다
 * 느슨하다. 그래서 픽스처는 **직렬화 이후의 실제 모양**으로 두고 경계에서 한 번만
 * 캐스팅한다. 필드 이름 오타는 아래 인터페이스가 잡는다.
 */
interface IntakeFixture {
  status: string;
  intakeAt: Date | string | null;
  intakeBy: { id: string; name: string; email: string; image: string | null } | null;
  requestedPriority: string;
  actualPriority: string | null;
  estimatedHours: number | string | null;
  estimatedCompletionDate: Date | string | null;
  intakeNotes: string | null;
}

const base: IntakeFixture = {
  status: 'IN_PROGRESS',
  intakeAt: new Date('2026-03-04T05:06:00.000Z'),
  intakeBy: { id: 'u1', name: '김접수', email: 'intake@example.com', image: null },
  requestedPriority: 'HIGH',
  actualPriority: 'HIGH',
  estimatedHours: null,
  estimatedCompletionDate: null,
  intakeNotes: null,
};

const makeSR = (over: Partial<IntakeFixture> = {}): SRDetails =>
  ({ ...base, ...over }) as unknown as SRDetails;

describe('IntakeInfoCard — 표시 여부', () => {
  it.each(['INTAKE', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CONFIRMED'])(
    '%s 상태에서는 접수 정보를 보여준다',
    (status) => {
      render(<IntakeInfoCard sr={makeSR({ status })} />);

      expect(screen.getByText('접수 정보')).toBeInTheDocument();
      expect(screen.getByText('김접수')).toBeInTheDocument();
    }
  );

  it.each(['REQUESTED', 'REJECTED'])('%s 상태에서는 아무것도 그리지 않는다', (status) => {
    const { container } = render(<IntakeInfoCard sr={makeSR({ status })} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('상태가 화이트리스트여도 접수 시각이 없으면 감춘다', () => {
    const { container } = render(
      <IntakeInfoCard sr={makeSR({ status: 'COMPLETED', intakeAt: null })} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('상태가 화이트리스트 밖이면 접수 시각이 있어도 감춘다', () => {
    const { container } = render(
      <IntakeInfoCard sr={makeSR({ status: 'REQUESTED', intakeAt: new Date() })} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('모르는 상태 문자열도 화이트리스트 밖으로 다룬다', () => {
    const { container } = render(<IntakeInfoCard sr={makeSR({ status: 'ESCALATED' })} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe('IntakeInfoCard — 접수자', () => {
  it('접수자가 없으면 N/A 로 대체한다', () => {
    render(<IntakeInfoCard sr={makeSR({ intakeBy: null })} />);

    expect(screen.getByText('접수자')).toBeInTheDocument();
    expect(screen.getByText('N/A')).toBeInTheDocument();
  });

  it('접수자 이름이 빈 문자열이어도 N/A 로 떨어진다', () => {
    render(
      <IntakeInfoCard
        sr={makeSR({ intakeBy: { id: 'u2', name: '', email: 'x@example.com', image: null } })}
      />
    );

    expect(screen.getByText('N/A')).toBeInTheDocument();
  });

  it('접수 일시를 사람이 읽는 형식으로 낸다', () => {
    render(<IntakeInfoCard sr={makeSR({ intakeAt: new Date('2026-03-04T05:06:00.000Z') })} />);

    // 라벨(h4) → 부모(아이콘+라벨 묶음) → 다음 형제(<p>) 가 값이다.
    expect(screen.getByText('접수 일시').parentElement!.nextElementSibling!).toHaveTextContent(
      /2026/
    );
  });

  it('직렬화된 문자열 날짜도 Date 와 같게 다룬다', () => {
    const asDate = render(
      <IntakeInfoCard sr={makeSR({ intakeAt: new Date('2026-03-04T05:06:00.000Z') })} />
    );
    const fromDate = asDate.getByText('접수 일시').parentElement!.nextElementSibling!.textContent;
    asDate.unmount();

    render(<IntakeInfoCard sr={makeSR({ intakeAt: '2026-03-04T05:06:00.000Z' })} />);
    expect(screen.getByText('접수 일시').parentElement!.nextElementSibling!).toHaveTextContent(
      fromDate!
    );
    expect(fromDate).toMatch(/2026/);
  });
});

describe('IntakeInfoCard — 우선순위', () => {
  /** 실물 Badge 의 cva 정의에서 따온 variant 별 대표 클래스. */
  const priorityColor = {
    CRITICAL: 'bg-destructive',
    HIGH: 'bg-destructive',
    MEDIUM: 'bg-primary/10',
    LOW: 'bg-secondary',
  } as const;

  const priorityLabel = {
    CRITICAL: '긴급',
    HIGH: '높음',
    MEDIUM: '보통',
    LOW: '낮음',
  } as const;

  it.each(Object.keys(priorityColor) as (keyof typeof priorityColor)[])(
    '요청 우선순위 %s 는 라벨과 지정된 색으로 그린다',
    (priority) => {
      // actualPriority 를 비워 요청 배지 하나만 남긴다.
      render(<IntakeInfoCard sr={makeSR({ requestedPriority: priority, actualPriority: null })} />);

      const badge = screen.getByText(priorityLabel[priority]);
      expect(badge.className).toContain(priorityColor[priority]);
    }
  );

  it('네 우선순위의 색이 실제로 세 갈래로 갈린다', () => {
    // 표를 그대로 베낀 단언이 아니라는 것을 못박는다(CRITICAL·HIGH 만 같은 색).
    const classNames = (Object.keys(priorityLabel) as (keyof typeof priorityLabel)[]).map((p) => {
      const { unmount } = render(
        <IntakeInfoCard sr={makeSR({ requestedPriority: p, actualPriority: null })} />
      );
      const className = screen.getByText(priorityLabel[p]).className;
      unmount();
      return className;
    });

    expect(new Set(classNames).size).toBe(3);
  });

  it('실제 우선순위가 없으면 화살표도 실제 배지도 없다', () => {
    render(<IntakeInfoCard sr={makeSR({ requestedPriority: 'MEDIUM', actualPriority: null })} />);

    expect(screen.getByText('요청:')).toBeInTheDocument();
    expect(screen.queryByText('실제:')).not.toBeInTheDocument();
    expect(screen.queryByText('→')).not.toBeInTheDocument();
    expect(screen.queryByText('변경됨')).not.toBeInTheDocument();
  });

  it('요청과 실제가 같으면 실제 배지는 있되 "변경됨" 은 없다', () => {
    render(<IntakeInfoCard sr={makeSR({ requestedPriority: 'HIGH', actualPriority: 'HIGH' })} />);

    expect(screen.getByText('실제:')).toBeInTheDocument();
    expect(screen.getAllByText('높음')).toHaveLength(2);
    expect(screen.queryByText('변경됨')).not.toBeInTheDocument();

    // ring 강조도 붙지 않아야 한다.
    //
    // ⚠️ `ring-2` 로 겨냥하면 안 된다 — Badge 의 기본 클래스에 이미 `focus:ring-2` 가
    //    있어 어느 쪽이든 통과하는 단언이 된다. 강조에만 있는 `ring-orange-500` 을 쓴다.
    for (const badge of screen.getAllByText('높음')) {
      expect(badge.className).not.toContain('ring-orange-500');
    }
  });

  it('요청과 실제가 다르면 "변경됨" 과 ring 강조를 붙인다', () => {
    render(
      <IntakeInfoCard sr={makeSR({ requestedPriority: 'LOW', actualPriority: 'CRITICAL' })} />
    );

    expect(screen.getByText('변경됨')).toBeInTheDocument();
    expect(screen.getByText('낮음').className).not.toContain('ring-orange-500');
    // ring 은 실제 우선순위 배지에만 붙는다.
    expect(screen.getByText('긴급').className).toContain('ring-orange-500');
  });
});

describe('IntakeInfoCard — 선택 필드', () => {
  it('예상 작업 시간이 있으면 숫자로 환산해 낸다', () => {
    render(<IntakeInfoCard sr={makeSR({ estimatedHours: 7.5 })} />);

    expect(screen.getByText('예상 작업 시간')).toBeInTheDocument();
    expect(screen.getByText('7.5시간')).toBeInTheDocument();
  });

  it('Decimal 이 문자열로 직렬화돼 와도 숫자로 환산한다', () => {
    // Prisma Decimal 은 직렬화 경로에 따라 '4.00' 같은 문자열로 온다.
    render(<IntakeInfoCard sr={makeSR({ estimatedHours: '4.00' })} />);

    expect(screen.getByText('4시간')).toBeInTheDocument();
  });

  it('0시간도 감추지 않는다 (falsy 가 아니라 null/undefined 만 걸러야 한다)', () => {
    render(<IntakeInfoCard sr={makeSR({ estimatedHours: 0 })} />);

    expect(screen.getByText('0시간')).toBeInTheDocument();
  });

  it('예상 작업 시간이 null 이면 항목 자체를 뺀다', () => {
    render(<IntakeInfoCard sr={makeSR({ estimatedHours: null })} />);

    expect(screen.queryByText('예상 작업 시간')).not.toBeInTheDocument();
  });

  it('예상 작업 시간이 undefined 여도 항목을 뺀다', () => {
    render(<IntakeInfoCard sr={makeSR({ estimatedHours: undefined })} />);

    expect(screen.queryByText('예상 작업 시간')).not.toBeInTheDocument();
  });

  it('예상 완료일이 있으면 날짜로 낸다', () => {
    render(
      <IntakeInfoCard
        sr={makeSR({ estimatedCompletionDate: new Date('2026-12-25T00:00:00.000Z') })}
      />
    );

    expect(screen.getByText('예상 완료일').nextElementSibling!).toHaveTextContent('2026');
  });

  it('예상 완료일이 없으면 항목을 뺀다', () => {
    render(<IntakeInfoCard sr={makeSR({ estimatedCompletionDate: null })} />);

    expect(screen.queryByText('예상 완료일')).not.toBeInTheDocument();
  });

  it('접수 메모가 있으면 줄바꿈을 살려 낸다', () => {
    render(<IntakeInfoCard sr={makeSR({ intakeNotes: '1차 확인 완료\n담당자 배정 대기' })} />);

    expect(screen.getByText('접수 메모')).toBeInTheDocument();
    const notes = screen.getByText(/1차 확인 완료/);
    expect(notes.className).toContain('whitespace-pre-line');
  });

  it('접수 메모가 없으면 항목을 뺀다', () => {
    render(<IntakeInfoCard sr={makeSR({ intakeNotes: null })} />);

    expect(screen.queryByText('접수 메모')).not.toBeInTheDocument();
  });

  it('빈 문자열 메모도 감춘다', () => {
    render(<IntakeInfoCard sr={makeSR({ intakeNotes: '' })} />);

    expect(screen.queryByText('접수 메모')).not.toBeInTheDocument();
  });

  it('선택 필드를 전부 채우면 모두 함께 나온다', () => {
    render(
      <IntakeInfoCard
        sr={makeSR({
          requestedPriority: 'MEDIUM',
          actualPriority: 'CRITICAL',
          estimatedHours: 12,
          estimatedCompletionDate: '2026-12-25T00:00:00.000Z',
          intakeNotes: '메모',
        })}
      />
    );

    expect(screen.getByText('변경됨')).toBeInTheDocument();
    expect(screen.getByText('12시간')).toBeInTheDocument();
    expect(screen.getByText('예상 완료일')).toBeInTheDocument();
    expect(screen.getByText('메모')).toBeInTheDocument();
  });
});
