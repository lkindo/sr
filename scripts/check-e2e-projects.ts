import type { JSONReport, JSONReportSpec, JSONReportSuite } from '@playwright/test/reporter';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const playwrightCli = join(dirname(require.resolve('playwright/package.json')), 'cli.js');

// --list resolves project inheritance and collects tests without starting servers or touching DBs.
function collect(config: string): JSONReportSpec[] {
  const report: JSONReport = JSON.parse(
    execFileSync(
      process.execPath,
      [playwrightCli, 'test', '--config', config, '--list', '--reporter=json'],
      { encoding: 'utf8', timeout: 60_000, maxBuffer: 16 * 1024 * 1024 }
    )
  );
  assert.equal(report.errors.length, 0, `${config}: test collection failed`);
  const flatten = (suites: JSONReportSuite[]): JSONReportSpec[] =>
    suites.flatMap((suite) => [...suite.specs, ...flatten(suite.suites ?? [])]);
  const specs = flatten(report.suites);
  assert.ok(specs.length > 0, `${config}: no tests collected`);
  return specs;
}

const desktop = collect('playwright.config.ts');
for (const spec of desktop) {
  assert.ok(
    !spec.file.replaceAll('\\', '/').startsWith('mobile/'),
    `Mobile test collected by desktop config: ${spec.file} (${spec.tests.map((test) => test.projectName).join(', ')})`
  );
}

const mobile = collect('playwright.mobile.config.ts');
const projectsByTest = new Map<string, Set<string>>();
for (const spec of mobile) {
  const key = `${spec.file}:${spec.line}:${spec.column}:${spec.title}`;
  const projects = projectsByTest.get(key) ?? new Set<string>();
  for (const test of spec.tests) projects.add(test.projectName);
  projectsByTest.set(key, projects);
}
for (const [test, projects] of projectsByTest) {
  assert.deepEqual(
    [...projects].sort(),
    ['mobile-chromium', 'mobile-webkit'],
    `${test}: every mobile test must run in both mobile browser projects`
  );
}
console.log(
  `E2E collection verified: desktop ${desktop.reduce((sum, spec) => sum + spec.tests.length, 0)} tests; mobile ${projectsByTest.size} scenarios in both browsers; no overlap.`
);
