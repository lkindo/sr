import { readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FORBIDDEN_DIRECTORIES = new Set(['.git', '.claude', '.gemini']);
const FORBIDDEN_FILE_NAMES = [
  /^\.env(?:\.|$)/i,
  /\.key$/i,
  /\.pem$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /^id_(?:rsa|dsa|ecdsa|ed25519)$/i,
] as const;

function isForbiddenFileName(name: string): boolean {
  return FORBIDDEN_FILE_NAMES.some((pattern) => pattern.test(name));
}

export async function findForbiddenArtifactFiles(root: string): Promise<string[]> {
  const forbidden: string[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });

    await Promise.all(
      entries.map(async (entry) => {
        const absolutePath = path.join(directory, entry.name);
        const relativePath = path.relative(root, absolutePath);

        if (entry.isDirectory()) {
          if (FORBIDDEN_DIRECTORIES.has(entry.name)) {
            const nested = await collectFiles(absolutePath);
            forbidden.push(...nested.map((file) => path.join(relativePath, file)));
            return;
          }
          await visit(absolutePath);
          return;
        }

        if (entry.isFile() && isForbiddenFileName(entry.name)) {
          forbidden.push(relativePath);
        }
      })
    );
  }

  async function collectFiles(directory: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        const nested = await collectFiles(absolutePath);
        files.push(...nested.map((file) => path.join(entry.name, file)));
      } else if (entry.isFile()) {
        files.push(entry.name);
      }
    }
    return files;
  }

  await visit(root);
  return forbidden.sort((left, right) => left.localeCompare(right));
}

export async function removeCopiedEnvironmentFiles(root: string): Promise<string[]> {
  const removed: string[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          await visit(absolutePath);
          return;
        }
        if (entry.isFile() && /^\.env(?:\.|$)/i.test(entry.name)) {
          await unlink(absolutePath);
          removed.push(path.relative(root, absolutePath));
        }
      })
    );
  }

  await visit(root);
  return removed.sort((left, right) => left.localeCompare(right));
}

async function main(): Promise<void> {
  const artifactRoot = path.resolve(process.cwd(), '.next', 'standalone');
  const removedEnvironmentFiles = await removeCopiedEnvironmentFiles(artifactRoot);
  if (removedEnvironmentFiles.length > 0) {
    console.log(
      `[standalone-secrets] 런타임 주입 대상 환경파일 제거: ${removedEnvironmentFiles.join(', ')}`
    );
  }
  const forbidden = await findForbiddenArtifactFiles(artifactRoot);

  if (forbidden.length > 0) {
    throw new Error(
      `Standalone 산출물에 비밀 또는 도구 파일이 포함되었습니다:\n${forbidden
        .map((file) => `  - ${file}`)
        .join('\n')}`
    );
  }

  console.log('[standalone-secrets] OK — 금지된 비밀 파일이 없습니다.');
}

const invokedPath = process.argv[1];
if (invokedPath && path.resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
