import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * 키보드로 조작할 수 없는 클릭과 대비가 부족한 색 조합이 다시 들어오지 못하게 막는다.
 * axe 는 렌더된 화면만 보므로, 검사 페이지 밖의 코드와 다크 모드를 놓친다.
 */

/** 네이티브로 키보드 조작이 되거나, 안에서 그런 요소를 렌더하는 컴포넌트. */
const INTERACTIVE_TAG =
  /^(button|a|input|select|textarea|summary|Button|Link|Input|Checkbox|Switch|PaginationLink|PaginationPrevious|PaginationNext|\w*MenuItem|\w*MenuCheckboxItem|\w*Trigger|\w*Action|\w*Cancel|SelectItem|ToastAction|RadioGroupItem)$/;

/**
 * 예외. 이유 없이 늘리지 않는다. 키는 `파일:태그:onClick 첫 머리` 다.
 *  - 조직도 행: 같은 동작을 하는 펼침 버튼이 행 안에 있고, 행 클릭은 마우스용 편의다.
 *  - 조직도 래퍼: 클릭이 행으로 올라가지 않게 막을 뿐 동작이 없다.
 */
const ALLOWED = new Set([
  'src/components/organization/OrganizationTree.tsx:div:onClick={() => onToggleClient',
  'src/components/organization/OrganizationTree.tsx:div:onClick={(e) => e.stopPropagation',
]);

/** 역할과 키보드 포커스를 함께 갖췄으면 직접 처리한 것으로 본다. */
function findKeyboardlessClicks(file: string, source: string): string[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(tree);
      const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
      const named = (name: string) => attrs.find((a) => a.name.getText(tree) === name);
      const onClick = named('onClick');
      if (
        onClick &&
        !INTERACTIVE_TAG.test(tag) &&
        !(named('role') && named('tabIndex') && named('onKeyDown'))
      ) {
        found.push(`${file}:${tag}:${onClick.getText(tree).slice(0, 40).replace(/\s+/g, ' ')}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}

const sourceFiles = execSync('git ls-files src', { encoding: 'utf8', maxBuffer: 1e8 })
  .split('\n')
  .filter((file) => file.endsWith('.tsx') && !/__tests__|\.test\.|\.stories\./.test(file));

describe('키보드 접근', () => {
  it('클릭만 받고 키보드로 조작할 수 없는 요소가 없다', () => {
    const offenders = sourceFiles
      .flatMap((file) => findKeyboardlessClicks(file, readFileSync(file, 'utf8')))
      .filter((entry) => ![...ALLOWED].some((allowed) => entry.startsWith(allowed)));

    expect(offenders).toEqual([]);
  });

  it('예외 목록의 항목은 실제로 남아 있다', () => {
    const all = sourceFiles.flatMap((file) =>
      findKeyboardlessClicks(file, readFileSync(file, 'utf8'))
    );

    for (const allowed of ALLOWED) {
      expect(all.some((entry) => entry.startsWith(allowed))).toBe(true);
    }
  });

  describe('검사기', () => {
    const check = (jsx: string) => findKeyboardlessClicks('x.tsx', `const a = ${jsx};`);

    it.each([
      ['div', '<div onClick={f}>x</div>'],
      ['Card', '<Card onClick={f}>x</Card>'],
      ['Badge', '<Badge onClick={f} />'],
      ['역할만 있는 div', '<div role="button" onClick={f}>x</div>'],
      ['포커스 없는 div', '<div role="button" onKeyDown={f} onClick={f}>x</div>'],
    ])('%s 를 잡는다', (_name, jsx) => {
      expect(check(jsx)).toHaveLength(1);
    });

    it.each([
      ['button', '<button onClick={f}>x</button>'],
      ['Button', '<Button onClick={f}>x</Button>'],
      ['Link', '<Link href="/" onClick={f}>x</Link>'],
      ['직접 처리한 div', '<div role="checkbox" tabIndex={0} onKeyDown={f} onClick={f}>x</div>'],
      ['클릭 없는 div', '<div>x</div>'],
    ])('%s 는 통과한다', (_name, jsx) => {
      expect(check(jsx)).toEqual([]);
    });
  });
});

function relativeLuminance([h, s, l]: number[]): number {
  const [hue, sat, light] = [h!, s! / 100, l! / 100];
  const amount = sat * Math.min(light, 1 - light);
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    const value = light - amount * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(8) + 0.0722 * channel(4);
}

function contrast(a: number[], b: number[]): number {
  const [x, y] = [relativeLuminance(a), relativeLuminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe('색 대비', () => {
  const css = readFileSync('src/app/globals.css', 'utf8');
  const darkAt = css.indexOf('.dark');
  const THEMES: Array<[string, string]> = [
    ['라이트', css.slice(0, darkAt)],
    ['다크', css.slice(darkAt)],
  ];
  const token = (theme: string, name: string): number[] => {
    const match = new RegExp(`--${name}:\\s*([\\d.]+) ([\\d.]+)% ([\\d.]+)%`).exec(theme);
    if (!match) throw new Error(`토큰 없음: ${name}`);
    return match.slice(1).map(Number);
  };

  it.each(THEMES)('%s: 파괴 동작의 흰 글자는 4.5:1 이상이다', (_name, theme) => {
    expect(
      contrast(token(theme, 'destructive-solid'), token(theme, 'destructive-foreground'))
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each(THEMES)('%s: 입력란 테두리는 배경과 3:1 이상이다', (_name, theme) => {
    expect(contrast(token(theme, 'input'), token(theme, 'background'))).toBeGreaterThanOrEqual(3);
  });

  // 다크 모드의 --destructive 는 글자용으로 밝다. 그 위에 흰 글자를 올리면 2.3:1 이 된다.
  it('글자용 --destructive 를 글자 배경으로 쓰지 않는다', () => {
    // 주석은 뺀다. 옛 조합을 설명하는 글에 걸리면 안 된다.
    const usesTextTokenAsBackground = (file: string) =>
      readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .filter((line) => !/^\s*(\/\/|\*|\{\/\*)/.test(line))
        .some((line) => /(?:^|[\s'"`])bg-destructive(?=[\s'"`])/.test(line));
    const offenders = sourceFiles.filter(usesTextTokenAsBackground);

    expect(offenders).toEqual([]);
  });
});
