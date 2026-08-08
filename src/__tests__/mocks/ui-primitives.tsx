import { type ComponentPropsWithoutRef, forwardRef, type ReactNode } from 'react';

/**
 * 다이얼로그 테스트용 shadcn 프리미티브 대역.
 *
 * **왜 대역이 필요한가.** Radix 의 Dialog·Select 는 포털과 포인터 이벤트를 요구해서
 * jsdom 에서 그대로 쓰면 테스트가 라이브러리 구현에 묶인다. 우리가 확인하려는 것은
 * 폼의 판정 로직(무엇을 막고, 무엇을 서버로 보내는가)이지 Radix 의 렌더가 아니다.
 * 프리미티브 자체는 벤더링된 코드라 별도 테스트 대상도 아니다.
 *
 * **왜 한곳에 모았는가.** 다이얼로그 테스트마다 같은 대역을 복붙하면 프리미티브 API 가
 * 바뀔 때 네 곳을 따로 고쳐야 하고, 무엇보다 `any` 로 대충 받는 코드가 파일마다 쌓인다
 * (실제로 63건의 lint 경고가 여기서 나왔다). 여기서 한 번 타입을 붙여 둔다.
 *
 * `Select` 는 네이티브 `<select>` 로 바꾼다. 값이 바뀌는 경로만 있으면 충분하고,
 * 그래야 테스트가 "옵션을 클릭하는 방법"이 아니라 "무엇을 골랐는가"를 다룬다.
 */

interface WithChildren {
  children?: ReactNode;
}

interface DialogProps extends WithChildren {
  open?: boolean;
}

interface ButtonProps extends WithChildren {
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}

/**
 * 입력 계열 대역은 실제로 네이티브 엘리먼트를 렌더하므로 React 의 prop 타입을 그대로
 * 쓴다. 손으로 인터페이스를 만들면 placeholder·required·min 같은 전달 prop 마다
 * 항목을 늘려야 하고, 인덱스 시그니처로 뭉뚱그리면 스프레드가 unknown 이 되어 깨진다.
 */
interface LabelProps extends WithChildren {
  htmlFor?: string;
}

interface ToggleProps {
  id?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

interface SelectProps extends WithChildren {
  value?: string;
  onValueChange?: (value: string) => void;
}

interface SelectItemProps extends WithChildren {
  value: string;
}

/**
 * `vi.mock('@/components/ui', ...)` 팩토리에서 그대로 반환한다.
 *
 * 팩토리는 호이스팅되므로 이 모듈은 `await import()` 로 불러야 한다:
 *
 * ```ts
 * vi.mock('@/components/ui', async () => (await import('@/__tests__/mocks/ui-primitives')).uiMock());
 * ```
 */
export function uiMock() {
  const passthrough = ({ children }: WithChildren) => <div>{children}</div>;

  return {
    Dialog: ({ children, open }: DialogProps) => (open ? <div>{children}</div> : null),
    DialogContent: passthrough,
    DialogHeader: passthrough,
    DialogFooter: passthrough,
    DialogTitle: ({ children }: WithChildren) => <h2>{children}</h2>,
    DialogDescription: ({ children }: WithChildren) => <p>{children}</p>,

    Button: ({ children, onClick, disabled, type }: ButtonProps) => (
      <button onClick={onClick} disabled={disabled} type={type}>
        {children}
      </button>
    ),

    Input: forwardRef<HTMLInputElement, ComponentPropsWithoutRef<'input'>>((props, ref) => (
      <input ref={ref} {...props} />
    )),

    Textarea: forwardRef<HTMLTextAreaElement, ComponentPropsWithoutRef<'textarea'>>(
      (props, ref) => <textarea ref={ref} {...props} />
    ),

    Label: ({ children, htmlFor }: LabelProps) => <label htmlFor={htmlFor}>{children}</label>,

    // Checkbox·Switch 는 제어 컴포넌트라 onCheckedChange 로 값을 되돌려 준다.
    Checkbox: ({ id, checked, onCheckedChange }: ToggleProps) => (
      <input
        type="checkbox"
        id={id}
        checked={!!checked}
        onChange={(event) => onCheckedChange?.(event.target.checked)}
      />
    ),
    Switch: ({ id, checked, onCheckedChange }: ToggleProps) => (
      <input
        type="checkbox"
        id={id}
        checked={!!checked}
        onChange={(event) => onCheckedChange?.(event.target.checked)}
      />
    ),

    Select: ({ children, value, onValueChange }: SelectProps) => (
      <select
        data-testid="select"
        value={value}
        onChange={(event) => onValueChange?.(event.target.value)}
      >
        {children}
      </select>
    ),
    SelectTrigger: ({ children }: WithChildren) => <>{children}</>,
    SelectValue: () => null,
    SelectContent: ({ children }: WithChildren) => <>{children}</>,
    SelectItem: ({ children, value }: SelectItemProps) => <option value={value}>{children}</option>,

    Badge: ({ children }: WithChildren) => <span>{children}</span>,
    ScrollArea: passthrough,
    Skeleton: () => <div data-testid="skeleton" />,
  };
}
