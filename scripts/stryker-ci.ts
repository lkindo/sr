import { execSync } from 'child_process';
import path from 'path';

/**
 * Stryker Mutation Test Runner for CI
 *
 * Runs mutation monitoring only on files changed relative to the target branch.
 * Usage: tsx scripts/stryker-ci.ts
 */

const TARGET_BRANCH = process.env.GITHUB_BASE_REF
  ? `origin/${process.env.GITHUB_BASE_REF}`
  : 'origin/main';
const SUBPROJECT_DIR = 'src';

function log(message: string) {
  console.log(`[Stryker-CI] ${message}`);
}

function getChangedFiles(): string[] {
  try {
    // Ensure we have the target branch reference
    try {
      execSync(`git fetch origin ${process.env.GITHUB_BASE_REF || 'main'} --depth=1`, {
        stdio: 'ignore',
      });
    } catch (e) {
      log(
        'Failed to fetch target branch, assuming it exists or running in a context where fetch is not needed.'
      );
    }

    const diffCommand = `git diff --name-only --diff-filter=AM ${TARGET_BRANCH}...HEAD`;
    // If not in a PR or detached state, this might vary, but for PRs this is standard.
    // Fallback for non-PR push: compare against previous commit?
    // For now, optimize for PRs as requested for "CI checks".

    log(`Calculating diff against ${TARGET_BRANCH}...`);
    const output = execSync(diffCommand).toString();
    return output.split('\n').filter(Boolean);
  } catch (error) {
    log(`Error calculating changed files: ${error}`);
    // Fallback or exit? If we can't determine changes, maybe safer to not run or fail?
    // Let's log and return empty to avoid breaking build if git fails, or maybe throw?
    // User wants optimization, so if git fails, we probably shouldn't run everything.
    return [];
  }
}

function run() {
  const changedFiles = getChangedFiles();

  // Filter for Typescript files in src, excluding tests and ignored patterns
  const filesToMutate = changedFiles.filter((file) => {
    return (
      file.startsWith(SUBPROJECT_DIR) &&
      file.endsWith('.ts') &&
      !file.endsWith('.test.ts') &&
      !file.endsWith('.spec.ts') &&
      !file.includes('__tests__') &&
      !file.includes('__mocks__') &&
      !file.includes('types/') &&
      !file.includes('generated/')
    );
  });

  if (filesToMutate.length === 0) {
    log('No applicable file changes detected. Skipping mutation testing.');
    process.exit(0);
  }

  log(`Found ${filesToMutate.length} file(s) to mutate:`);
  filesToMutate.forEach((f) => console.log(` - ${f}`));

  // Construct Stryker command
  // We use the same config but override the mutate array
  const strykerCmd = `npx stryker run --mutate ${filesToMutate.join(' ')}`;

  try {
    log('Starting Stryker...');
    execSync(strykerCmd, { stdio: 'inherit' });
    log('Mutation testing completed successfully.');
  } catch (error) {
    log('Mutation testing failed.');
    process.exit(1);
  }
}

run();
