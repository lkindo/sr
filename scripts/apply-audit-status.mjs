#!/usr/bin/env node
/**
 * 감사 문서에 항목별 검증 상태를 반영한다.
 *
 * 이 문서는 오랫동안 **진행 추적기가 아니었다.** 작업할 때마다 일부 항목에만 "해소됨"을
 * 적었고 3.x 는 거의 방치되어, "얼마나 끝났나"에 아무도 답할 수 없었다. 이 스크립트는
 * 검증 결과(JSON)를 받아 각 항목 제목에 상태 표식을 박고 근거를 한 줄 덧붙인다.
 *
 * 표식은 grep 가능한 고정 문자열이다. 다음에 세는 사람은 이 스크립트 없이도 셀 수 있다.
 *
 *   node scripts/apply-audit-status.mjs <results.json> [--dry-run]
 *
 * results.json 형식:
 *   [{ "id": "3.14" | "4.1|제목앞부분", "status": "FIXED", "evidence": "...", "remaining": "..." }]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const AUDIT = 'docs/archive/PROJECT_AUDIT_2026-07-29.md';

const BADGE = {
  FIXED: '[해소]',
  PARTIAL: '[부분]',
  NOT_FIXED: '[미해소]',
  ACCEPTED_RISK: '[수용된위험]',
  UNVERIFIABLE: '[확인불가]',
};

const [, , resultsPath, ...flags] = process.argv;
if (!resultsPath) {
  console.error('사용법: node scripts/apply-audit-status.mjs <results.json> [--dry-run]');
  process.exit(1);
}
const dryRun = flags.includes('--dry-run');

const results = JSON.parse(readFileSync(resultsPath, 'utf8'));
const raw = readFileSync(AUDIT, 'utf8');
const crlf = raw.includes('\r\n');
let lines = raw.replace(/\r\n/g, '\n').split('\n');

/** 이미 붙어 있는 표식을 지운다 — 재실행해도 중복되지 않게. */
const stripBadge = (text) => {
  let out = text;
  for (const badge of Object.values(BADGE)) {
    out = out.split(`${badge} `).join('');
  }
  return out;
};

/** 이전 실행이 남긴 근거 줄을 걷어낸다. */
const EVIDENCE_PREFIX = '  <!-- verified:';
lines = lines.filter((line) => !line.startsWith(EVIDENCE_PREFIX));

let applied = 0;
const missed = [];

for (const item of results) {
  const badge = BADGE[item.status];
  if (!badge) {
    missed.push(`${item.id} (알 수 없는 status: ${item.status})`);
    continue;
  }

  let index = -1;

  if (/^3\.\d+$/.test(item.id)) {
    // 3.x — "### 3.14 ..." 헤딩
    index = lines.findIndex((line) => new RegExp(`^###\\s+${item.id.replace('.', '\\.')}\\s`).test(line));
    if (index >= 0) {
      const head = stripBadge(lines[index]);
      lines[index] = head.replace(new RegExp(`^(###\\s+${item.id.replace('.', '\\.')})\\s`), `$1 ${badge} `);
    }
  } else {
    // 4.x — "4.1|제목앞부분" → 해당 절에서 제목으로 불릿을 찾는다
    const [section, title] = item.id.split('|');
    const secIdx = lines.findIndex((line) => line.startsWith(`### ${section} `));
    if (secIdx >= 0 && title) {
      const needle = title.trim().slice(0, 30);
      for (let i = secIdx + 1; i < lines.length; i++) {
        if (lines[i].startsWith('### ') || lines[i].startsWith('## ')) break;
        if (!lines[i].startsWith('- ')) continue;
        if (lines[i].includes(needle)) {
          index = i;
          const body = stripBadge(lines[i]);
          lines[i] = body.replace(/^- /, `- ${badge} `);
          break;
        }
      }
    }
  }

  if (index < 0) {
    missed.push(item.id);
    continue;
  }

  // 근거를 HTML 주석으로 남긴다 — 렌더링을 어지럽히지 않으면서 grep 가능하다.
  const note = [item.evidence, item.remaining && `남은 일: ${item.remaining}`]
    .filter(Boolean)
    .join(' / ')
    .replace(/-->/g, '--&gt;');
  lines.splice(index + 1, 0, `${EVIDENCE_PREFIX} ${item.status} — ${note} -->`);
  applied++;
}

const out = lines.join('\n');
if (dryRun) {
  console.log(`[dry-run] 적용 대상 ${applied}건`);
} else {
  writeFileSync(AUDIT, crlf ? out.replace(/\n/g, '\r\n') : out, 'utf8');
  console.log(`적용 ${applied}건 → ${AUDIT}`);
}

if (missed.length) {
  console.warn(`\n매칭 실패 ${missed.length}건 — 수동 확인 필요:`);
  for (const id of missed) console.warn(`  - ${id}`);
}
