import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { parseJsonBody, validateRequestBody } from '../api-helpers';
import { BadRequestError, ValidationError } from '../errors';

/**
 * 감사 4.3 회귀 테스트 — 깨진/빈 JSON 은 400 이어야 한다.
 *
 * `validateRequestBody` 는 `await request.json()` 을 try 블록 **밖**에 두어,
 * 깨진 본문에서 던져진 SyntaxError 가 ServiceError 가 아닌 채로 탈출했다.
 * 에러 핸들러는 그것을 500 으로 매핑한다.
 *
 * 클라이언트 잘못인 요청이 서버 오류로 보고되면, 5xx 만 재시도하는 클라이언트는
 * **절대 성공할 수 없는 요청을 계속 재시도한다.**
 */

const req = (body: string | null) =>
  new Request('http://localhost/api/x', {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json' },
  });

const schema = z.object({ name: z.string().min(1) });

describe('parseJsonBody', () => {
  it('정상 JSON 을 파싱한다', async () => {
    await expect(parseJsonBody(req('{"name":"홍길동"}'))).resolves.toEqual({ name: '홍길동' });
  });

  it('깨진 JSON 은 BadRequestError(400)로 거부한다', async () => {
    await expect(parseJsonBody(req('{name:'))).rejects.toBeInstanceOf(BadRequestError);
  });

  it('빈 본문은 BadRequestError(400)로 거부한다', async () => {
    await expect(parseJsonBody(req(''))).rejects.toBeInstanceOf(BadRequestError);
  });

  it('공백만 있는 본문도 거부한다', async () => {
    await expect(parseJsonBody(req('   \n '))).rejects.toBeInstanceOf(BadRequestError);
  });

  it('거부 시 statusCode 가 400 이다 (500 이 아니다)', async () => {
    try {
      await parseJsonBody(req('nope'));
      expect.unreachable('던져야 한다');
    } catch (error) {
      expect((error as BadRequestError).statusCode).toBe(400);
    }
  });

  it('JSON 배열/원시값도 그대로 통과시킨다 (호출부가 좁힌다)', async () => {
    await expect(parseJsonBody(req('[1,2]'))).resolves.toEqual([1, 2]);
    await expect(parseJsonBody(req('null'))).resolves.toBeNull();
  });
});

describe('validateRequestBody', () => {
  it('유효한 본문을 스키마 타입으로 돌려준다', async () => {
    await expect(validateRequestBody(req('{"name":"a"}'), schema)).resolves.toEqual({ name: 'a' });
  });

  it('깨진 JSON 은 400 이다 (예전에는 500 이었다)', async () => {
    await expect(validateRequestBody(req('{oops'), schema)).rejects.toBeInstanceOf(BadRequestError);
  });

  it('빈 본문도 400 이다', async () => {
    await expect(validateRequestBody(req(''), schema)).rejects.toBeInstanceOf(BadRequestError);
  });

  it('스키마 위반은 ValidationError(400)로 구분된다', async () => {
    await expect(validateRequestBody(req('{"name":""}'), schema)).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it('어떤 실패든 5xx 로 새지 않는다', async () => {
    for (const body of ['{bad', '', '   ', '{"name":""}', 'null']) {
      const error = await validateRequestBody(req(body), schema).catch((e) => e);
      expect(error.statusCode, `본문 ${JSON.stringify(body)} 가 400 이 아니다`).toBe(400);
    }
  });
});
