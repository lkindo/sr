import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type Rgb = readonly [number, number, number];
type ThemeTokens = Map<string, string>;

const MINIMUM_TEXT_CONTRAST = 4.5;
const WHITE: Rgb = [1, 1, 1];
const BLACK: Rgb = [0, 0, 0];

function readTokens(css: string, selector: ':root' | '.dark'): ThemeTokens {
  const block = css.match(selector === ':root' ? /:root\s*\{([^}]+)\}/ : /\.dark\s*\{([^}]+)\}/);
  const body = block?.[1];
  if (!body) throw new Error(`Missing theme selector: ${selector}`);

  const tokens: ThemeTokens = new Map();
  for (const [, name, value] of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    if (name === undefined || value === undefined) {
      throw new Error(`Invalid token declaration in theme: ${selector}`);
    }
    tokens.set(name, value.trim());
  }
  return tokens;
}

function tokenRgb(tokens: ThemeTokens, name: string): Rgb {
  const value = tokens.get(name);
  const match = value?.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!match) throw new Error(`Missing or unsupported HSL token: ${name}=${value}`);

  const [, hue, saturation, lightness] = match;
  const h = Number(hue) / 60;
  const s = Number(saturation) / 100;
  const l = Number(lightness) / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const secondary = chroma * (1 - Math.abs((h % 2) - 1));
  const offset = l - chroma / 2;
  const channels: Rgb =
    h < 1
      ? [chroma, secondary, 0]
      : h < 2
        ? [secondary, chroma, 0]
        : h < 3
          ? [0, chroma, secondary]
          : h < 4
            ? [0, secondary, chroma]
            : h < 5
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary];

  return [channels[0] + offset, channels[1] + offset, channels[2] + offset];
}

function luminance([red, green, blue]: Rgb): number {
  const linear = (channel: number) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

function contrast(first: Rgb, second: Rgb): number {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function composite(foreground: Rgb, background: Rgb, opacity: number): Rgb {
  return [
    foreground[0] * opacity + background[0] * (1 - opacity),
    foreground[1] * opacity + background[1] * (1 - opacity),
    foreground[2] * opacity + background[2] * (1 - opacity),
  ];
}

function assertReadable(foreground: Rgb, background: Rgb, label: string): void {
  const ratio = contrast(foreground, background);
  expect(ratio, `${label}: ${ratio.toFixed(2)}:1 must be at least 4.5:1`).toBeGreaterThanOrEqual(
    MINIMUM_TEXT_CONTRAST
  );
}

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
const lightTokens = readTokens(css, ':root');
const themes = [
  { name: '주간', tokens: lightTokens },
  { name: '야간', tokens: new Map([...lightTokens, ...readTokens(css, '.dark')]) },
];

describe('대비 계산과 위반 감지', () => {
  it('흰색·검은색은 21:1, 같은 색은 1:1이다', () => {
    expect(contrast(WHITE, BLACK)).toBe(21);
    expect(contrast(WHITE, WHITE)).toBe(1);
  });

  it('HSL 원색을 sRGB로 변환하고 불투명도는 표면과 합성한다', () => {
    const tokens = new Map([
      ['red', '0 100% 50%'],
      ['green', '120 100% 50%'],
      ['blue', '240 100% 50%'],
    ]);
    expect(tokenRgb(tokens, 'red')).toEqual([1, 0, 0]);
    expect(tokenRgb(tokens, 'green')).toEqual([0, 1, 0]);
    expect(tokenRgb(tokens, 'blue')).toEqual([0, 0, 1]);
    expect(composite(WHITE, BLACK, 0.15)).toEqual([0.15, 0.15, 0.15]);
  });

  it('전경을 배경과 같게 만든 메모리 fixture는 대비 검사를 실패시킨다', () => {
    const invalidTokens = new Map(lightTokens);
    invalidTokens.set('--foreground', invalidTokens.get('--background')!);

    expect(() =>
      assertReadable(
        tokenRgb(invalidTokens, '--foreground'),
        tokenRgb(invalidTokens, '--background'),
        '의도적 위반'
      )
    ).toThrow('1.00:1 must be at least 4.5:1');
  });
});

describe.each(themes)('$name 테마의 실제 CSS 토큰 대비', ({ tokens }) => {
  it.each(['background', 'card', 'muted', 'popover'])('%s 위 본문·보조 문구', (surface) => {
    for (const foreground of ['foreground', 'muted-foreground']) {
      assertReadable(
        tokenRgb(tokens, `--${foreground}`),
        tokenRgb(tokens, `--${surface}`),
        `${foreground} on ${surface}`
      );
    }
  });

  it.each([
    ['card', 'card-foreground'],
    ['popover', 'popover-foreground'],
    ['primary', 'primary-foreground'],
    ['destructive-solid', 'destructive-foreground'],
  ])('%s 표면의 전경 토큰 %s', (background, foreground) => {
    assertReadable(
      tokenRgb(tokens, `--${foreground}`),
      tokenRgb(tokens, `--${background}`),
      `${foreground} on ${background}`
    );
  });

  it.each(['info', 'success', 'warning', 'caution', 'danger'])(
    'status-%s 배지의 15%% 배경 합성',
    (status) => {
      const foreground = tokenRgb(tokens, `--status-${status}`);
      for (const surface of ['card', 'muted']) {
        assertReadable(
          foreground,
          composite(foreground, tokenRgb(tokens, `--${surface}`), 0.15),
          `status-${status} badge on ${surface}`
        );
      }
    }
  );

  it('성공 버튼의 채움 배경과 흰색 글자', () => {
    assertReadable(WHITE, tokenRgb(tokens, '--status-success-solid'), 'success solid button');
  });
});
