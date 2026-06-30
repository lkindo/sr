import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDebounce } from '../use-debounce';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('useDebounce', () => {
  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('initial', 300));
    expect(result.current).toBe('initial');
  });

  it('updates the value only after the delay elapses', () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: 'a', delay: 300 },
    });

    expect(result.current).toBe('a');

    rerender({ value: 'b', delay: 300 });
    // Not yet updated right after the change
    expect(result.current).toBe('a');

    // Advance less than the delay -> still old value
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe('a');

    // Cross the delay boundary -> updated
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('b');
  });

  it('uses the default delay of 300ms when none is provided', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value), {
      initialProps: { value: 'x' },
    });

    rerender({ value: 'y' });
    expect(result.current).toBe('x');

    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe('x');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('y');
  });

  it('resets the timer on rapid successive changes', () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: 'first', delay: 500 },
    });

    rerender({ value: 'second', delay: 500 });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    // Timer not finished yet
    expect(result.current).toBe('first');

    // New change resets the timer
    rerender({ value: 'third', delay: 500 });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    // Still old value because timer was reset (only 400ms since last change)
    expect(result.current).toBe('first');

    act(() => {
      vi.advanceTimersByTime(100);
    });
    // Now 500ms since 'third' -> latest value wins, intermediate 'second' skipped
    expect(result.current).toBe('third');
  });

  it('clears the pending timer on unmount (cleanup)', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    const { rerender, unmount } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'one' },
    });

    rerender({ value: 'two' });
    unmount();

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('works with non-string types (numbers)', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 200), {
      initialProps: { value: 1 },
    });

    expect(result.current).toBe(1);

    rerender({ value: 2 });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe(2);
  });
});
