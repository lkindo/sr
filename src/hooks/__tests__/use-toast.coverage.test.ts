import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function loadModule() {
  const mod = await import('../use-toast');
  return mod;
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
});

afterEach(async () => {
  const { __resetToastsForTest } = await loadModule();
  __resetToastsForTest();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('use-toast reducer', () => {
  it('ADD_TOAST는 토스트를 추가하고 TOAST_LIMIT(=1)을 적용한다', async () => {
    const { reducer } = await loadModule();
    const a = { id: 'a', title: 'A', open: true } as any;
    const b = { id: 'b', title: 'B', open: true } as any;

    const afterFirst = reducer({ toasts: [] }, { type: 'ADD_TOAST', toast: a });
    expect(afterFirst.toasts).toHaveLength(1);
    expect(afterFirst.toasts[0].id).toBe('a');

    // adding a second one keeps only newest due to TOAST_LIMIT
    const afterSecond = reducer(afterFirst, { type: 'ADD_TOAST', toast: b });
    expect(afterSecond.toasts).toHaveLength(1);
    expect(afterSecond.toasts[0].id).toBe('b');
  });

  it('UPDATE_TOAST는 일치하는 id만 갱신하고 다른 토스트는 유지한다', async () => {
    const { reducer } = await loadModule();
    const state = {
      toasts: [
        { id: 'x', title: 'X', open: true } as any,
        { id: 'y', title: 'Y', open: true } as any,
      ],
    };

    const updated = reducer(state, {
      type: 'UPDATE_TOAST',
      toast: { id: 'x', title: 'X new' },
    });
    expect(updated.toasts.find((t) => t.id === 'x')?.title).toBe('X new');
    expect(updated.toasts.find((t) => t.id === 'y')?.title).toBe('Y');
  });

  it('DISMISS_TOAST는 특정 id를 open:false로 만들고 제거 큐에 등록한다', async () => {
    const { reducer } = await loadModule();
    const state = { toasts: [{ id: 'd', title: 'D', open: true } as any] };

    const dismissed = reducer(state, { type: 'DISMISS_TOAST', toastId: 'd' });
    expect(dismissed.toasts[0].open).toBe(false);

    // The remove queue was scheduled; advancing timers triggers REMOVE_TOAST via dispatch.
    act(() => {
      vi.runAllTimers();
    });
  });

  it('DISMISS_TOAST는 toastId가 없으면 모든 토스트를 닫는다', async () => {
    const { reducer } = await loadModule();
    // Need memoryState to have toasts so addToRemoveQueue does not early-return.
    const state = {
      toasts: [
        { id: 'm1', title: 'M1', open: true } as any,
        { id: 'm2', title: 'M2', open: true } as any,
      ],
    };

    const dismissed = reducer(state, { type: 'DISMISS_TOAST' });
    expect(dismissed.toasts.every((t) => t.open === false)).toBe(true);
  });

  it('REMOVE_TOAST는 특정 id를 제거하고, id가 없으면 전체를 비운다', async () => {
    const { reducer } = await loadModule();
    const state = {
      toasts: [
        { id: 'r1', title: 'R1', open: true } as any,
        { id: 'r2', title: 'R2', open: true } as any,
      ],
    };

    const removedOne = reducer(state, { type: 'REMOVE_TOAST', toastId: 'r1' });
    expect(removedOne.toasts).toHaveLength(1);
    expect(removedOne.toasts[0].id).toBe('r2');

    const removedAll = reducer(state, { type: 'REMOVE_TOAST', toastId: undefined });
    expect(removedAll.toasts).toHaveLength(0);
  });
});

describe('toast() helper and useToast hook', () => {
  it('toast()는 토스트를 생성하고 id/dismiss/update를 반환한다', async () => {
    const { useToast, toast } = await loadModule();
    const { result } = renderHook(() => useToast());

    let handle: ReturnType<typeof toast> | undefined;
    act(() => {
      handle = toast({ title: '제목', description: '내용' });
    });

    expect(handle?.id).toBeTruthy();
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].title).toBe('제목');
    expect(result.current.toasts[0].open).toBe(true);

    // update via returned helper
    act(() => {
      handle?.update({ id: handle.id, title: '수정된 제목' } as any);
    });
    expect(result.current.toasts[0].title).toBe('수정된 제목');

    // dismiss via returned helper
    act(() => {
      handle?.dismiss();
    });
    expect(result.current.toasts[0].open).toBe(false);
  });

  it('onOpenChange(false)는 dismiss를 호출하여 토스트를 닫는다', async () => {
    const { useToast, toast } = await loadModule();
    const { result } = renderHook(() => useToast());

    act(() => {
      toast({ title: 'open-change' });
    });
    expect(result.current.toasts[0].open).toBe(true);

    act(() => {
      const onOpenChange = (result.current.toasts[0] as any).onOpenChange;
      onOpenChange(false);
    });
    expect(result.current.toasts[0].open).toBe(false);

    // open=true branch should be a no-op
    act(() => {
      const onOpenChange = (result.current.toasts[0] as any).onOpenChange;
      onOpenChange(true);
    });
    expect(result.current.toasts[0].open).toBe(false);
  });

  it('dismiss 후 TOAST_REMOVE_DELAY가 지나면 토스트가 제거된다', async () => {
    const { useToast, toast } = await loadModule();
    const { result } = renderHook(() => useToast());

    let id = '';
    act(() => {
      id = toast({ title: '곧 사라짐' }).id;
    });
    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      result.current.dismiss(id);
    });
    expect(result.current.toasts[0].open).toBe(false);

    act(() => {
      vi.runAllTimers();
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it('dismiss()를 id 없이 호출하면 모든 토스트를 닫는다', async () => {
    const { useToast, toast } = await loadModule();
    const { result } = renderHook(() => useToast());

    act(() => {
      toast({ title: '전체 닫기' });
    });
    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      result.current.dismiss();
    });
    expect(result.current.toasts.every((t) => t.open === false)).toBe(true);
  });

  it('listener는 unmount 시 제거되어 더 이상 상태 업데이트를 받지 않는다', async () => {
    const { useToast, toast } = await loadModule();
    const { result, unmount } = renderHook(() => useToast());

    act(() => {
      toast({ title: '첫번째' });
    });
    expect(result.current.toasts).toHaveLength(1);

    const snapshot = result.current.toasts;
    unmount();

    // After unmount the listener is removed; dispatching should not throw
    // and the captured snapshot remains unchanged.
    act(() => {
      toast({ title: '언마운트 이후' });
    });
    expect(result.current.toasts).toBe(snapshot);
  });

  it('addToRemoveQueue는 동일 id에 대해 중복 타이머를 만들지 않는다', async () => {
    const { useToast, toast } = await loadModule();
    const { result } = renderHook(() => useToast());

    let id = '';
    act(() => {
      id = toast({ title: '중복 큐' }).id;
    });

    act(() => {
      result.current.dismiss(id);
      result.current.dismiss(id); // second dismiss hits the toastTimeouts.has() early-return
    });

    act(() => {
      vi.runAllTimers();
    });
    expect(result.current.toasts).toHaveLength(0);
  });
});
