import React from 'react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
} from '../form';

type Values = { name: string };

function Harness({ error, childMessage }: { error?: string; childMessage?: string }) {
  const methods = useForm<Values>({ defaultValues: { name: '' } });

  useEffect(() => {
    if (error) methods.setError('name', { message: error });
  }, [error, methods]);

  return (
    <Form {...methods}>
      <FormField
        control={methods.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>이름</FormLabel>
            <FormControl>
              <input {...field} />
            </FormControl>
            <FormDescription>공개 이름입니다.</FormDescription>
            <FormMessage>{childMessage}</FormMessage>
          </FormItem>
        )}
      />
    </Form>
  );
}

function FieldProbe() {
  useFormField();
  return null;
}

function MissingFieldHarness() {
  const methods = useForm<Values>({ defaultValues: { name: '' } });
  return (
    <Form {...methods}>
      <FormItem>
        <FieldProbe />
      </FormItem>
    </Form>
  );
}

describe('Form 접근성 배선', () => {
  it('정상 필드는 설명만 연결하고 invalid를 false로 둔다', () => {
    render(<Harness />);

    const input = screen.getByRole('textbox', { name: '이름' });
    const description = screen.getByText('공개 이름입니다.');

    expect(input).toHaveAttribute('aria-describedby', description.id);
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByText('필수 입력입니다.')).not.toBeInTheDocument();
  });

  it('오류 필드는 설명과 메시지를 모두 연결하고 라벨을 강조한다', async () => {
    render(<Harness error="필수 입력입니다." childMessage="대체 문구" />);

    const message = await screen.findByText('필수 입력입니다.');
    const input = screen.getByRole('textbox', { name: '이름' });
    const description = screen.getByText('공개 이름입니다.');

    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'));
    expect(input).toHaveAttribute('aria-describedby', `${description.id} ${message.id}`);
    expect(screen.getByText('이름')).toHaveClass('text-destructive');
    expect(screen.queryByText('대체 문구')).not.toBeInTheDocument();
  });

  it('오류가 없으면 FormMessage의 자식 문구를 렌더링한다', () => {
    render(<Harness childMessage="도움말 메시지" />);

    expect(screen.getByText('도움말 메시지')).toHaveClass('text-destructive');
  });

  it('오류도 자식도 없으면 FormMessage는 아무것도 렌더링하지 않는다', () => {
    const { container } = render(<Harness />);

    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(screen.getByText('공개 이름입니다.')).toBeInTheDocument();
  });

  it('FormField 밖에서 useFormField를 쓰면 즉시 실패한다', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<MissingFieldHarness />)).toThrow(
      'useFormField should be used within <FormField>'
    );

    consoleError.mockRestore();
  });

  it('FormItem 밖에서 useFormField를 쓰면 즉시 실패한다', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    function MissingItemHarness() {
      const methods = useForm<Values>({ defaultValues: { name: '' } });
      return (
        <Form {...methods}>
          <FormField control={methods.control} name="name" render={() => <FieldProbe />} />
        </Form>
      );
    }

    expect(() => render(<MissingItemHarness />)).toThrow(
      'useFormField should be used within <FormItem>'
    );

    consoleError.mockRestore();
  });
});
