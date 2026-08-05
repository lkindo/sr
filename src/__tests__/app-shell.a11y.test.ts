/**
 * 앱 셸의 복원력·접근성 계약 (감사 4.4).
 *
 * 여기서 다루는 것들은 렌더링해서 단언하기 어렵거나(에러 바운더리는 실제 throw 가
 * 있어야 마운트된다) 순수 CSS 다. 그래서 **파일과 소스의 존재·형태**를 고정한다.
 * 약한 검증이지만, 이 항목들이 조용히 삭제되는 것은 막는다 — 실제로 예전에는
 * 셋 다 아예 없었고 아무도 알아채지 못했다.
 *
 * 실제 동작 검증은 e2e(`30-accessibility.spec.ts`)가 담당한다.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

/**
 * 주석을 제거한 소스. 주석에는 "예전에는 `h-screen` 이었다" 같은 설명이 들어가므로,
 * 코드를 검사하려는 단언이 주석에 걸리면 안 된다.
 */
const readCode = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('에러 바운더리', () => {
  it('(dashboard) 세그먼트에 자체 error.tsx 가 있다', () => {
    // 루트 error.tsx 만 있으면 대시보드 오류가 셸(헤더·사이드바)까지 대체한다.
    expect(existsSync(join(root, 'src/app/(dashboard)/error.tsx'))).toBe(true);
  });

  it('대시보드 에러 바운더리가 뷰포트를 점유하지 않는다', () => {
    const code = readCode('src/app/(dashboard)/error.tsx');

    // `h-screen` 이면 레이아웃 안에 있어도 화면을 통째로 밀어낸다.
    expect(code).not.toMatch(/\bh-screen\b/);
    expect(code).toMatch(/min-h-/);
  });

  it('대시보드 에러 바운더리가 복구 경로를 제공한다', () => {
    const source = read('src/app/(dashboard)/error.tsx');

    expect(source).toContain('reset()');
    expect(source).toContain('/dashboard');
  });

  it('대시보드 에러 바운더리가 console 대신 로거를 쓴다', () => {
    const code = readCode('src/app/(dashboard)/error.tsx');

    // 프로젝트 자체 no-console 규칙과 일치시킨다.
    expect(code).not.toContain('console.error');
    expect(code).toContain('logger.error');
  });

  it('global-error.tsx 가 있고 html/body 를 직접 렌더링한다', () => {
    const path = 'src/app/global-error.tsx';
    expect(existsSync(join(root, path))).toBe(true);

    const source = read(path);
    // 루트 레이아웃을 대체하므로 Next 가 html/body 를 요구한다.
    expect(source).toContain('<html');
    expect(source).toContain('<body');
  });

  it('global-error 는 깨졌을 수 있는 앱 모듈을 import 하지 않는다', () => {
    const code = readCode('src/app/global-error.tsx');

    // 프로바이더 트리가 throw 해서 여기까지 왔는데 그 트리를 다시 import 하면
    // 에러 페이지 자신이 같은 이유로 깨진다.
    expect(code).not.toMatch(/from '@\/components/);
    expect(code).not.toMatch(/from '@\/lib/);
  });
});

describe('키보드 접근성', () => {
  it('대시보드 레이아웃 첫 자식이 본문 바로가기 링크다', () => {
    const source = read('src/app/(dashboard)/layout.tsx');

    expect(source).toContain('sr-skip-link');
    expect(source).toContain('href="#main-content"');
  });

  it('바로가기 링크의 대상이 실제로 존재하고 포커스를 받을 수 있다', () => {
    const source = read('src/app/(dashboard)/MainContent.tsx');

    expect(source).toContain('id="main-content"');
    // tabIndex 가 없으면 앵커 이동 후에도 포커스가 옮겨가지 않아
    // 다음 탭이 사이드바로 돌아간다 — 링크가 사실상 무동작이 된다.
    expect(source).toContain('tabIndex={-1}');
  });

  it('바로가기 링크가 포커스 시 보이도록 스타일이 정의돼 있다', () => {
    const css = read('src/app/globals.css');

    expect(css).toContain('.sr-skip-link');
    expect(css).toContain('.sr-skip-link:focus-visible');
    // display:none / visibility:hidden 은 포커스 자체를 막는다.
    expect(css).not.toMatch(/\.sr-skip-link\s*\{[^}]*display:\s*none/);
  });
});

describe('prefers-reduced-motion', () => {
  const css = read('src/app/globals.css');

  it('모션 축소 미디어 쿼리가 있다', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('애니메이션을 0 이 아니라 0.01ms 로 만든다', () => {
    // 0s 로 두면 transitionend/animationend 를 기다리는 코드가 영원히 멈춘다.
    expect(css).toContain('animation-duration: 0.01ms !important');
    expect(css).toContain('transition-duration: 0.01ms !important');
  });

  it('무한 반복 애니메이션을 1회로 제한한다', () => {
    // `animate-spin` 스피너가 계속 도는 것을 막는다.
    expect(css).toContain('animation-iteration-count: 1 !important');
  });
});
