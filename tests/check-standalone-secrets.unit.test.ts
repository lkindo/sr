import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  findForbiddenArtifactFiles,
  removeCopiedEnvironmentFiles,
} from '../scripts/check-standalone-secrets';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function artifactDir() {
  const dir = await mkdtemp(path.join(tmpdir(), 'sr-standalone-check-'));
  tempDirs.push(dir);
  return dir;
}

describe('findForbiddenArtifactFiles', () => {
  it('accepts an artifact containing only runtime files', async () => {
    const root = await artifactDir();
    await mkdir(path.join(root, '.next'), { recursive: true });
    await writeFile(path.join(root, 'server.js'), 'console.log("server")');
    await writeFile(path.join(root, '.next', 'required-server-files.json'), '{}');

    await expect(findForbiddenArtifactFiles(root)).resolves.toEqual([]);
  });

  it.each(['.env', '.env.production', 'deploy.key', 'certificate.p12', 'id_rsa'])(
    'rejects sensitive file name %s anywhere in the artifact',
    async (fileName) => {
      const root = await artifactDir();
      const nested = path.join(root, 'nested');
      await mkdir(nested, { recursive: true });
      await writeFile(path.join(nested, fileName), 'secret');

      await expect(findForbiddenArtifactFiles(root)).resolves.toEqual([
        path.join('nested', fileName),
      ]);
    }
  );

  it('rejects copied tool and VCS directories', async () => {
    const root = await artifactDir();
    await mkdir(path.join(root, '.git'), { recursive: true });
    await mkdir(path.join(root, '.gemini'), { recursive: true });
    await writeFile(path.join(root, '.git', 'config'), 'config');
    await writeFile(path.join(root, '.gemini', 'settings.json'), '{}');

    await expect(findForbiddenArtifactFiles(root)).resolves.toEqual([
      path.join('.gemini', 'settings.json'),
      path.join('.git', 'config'),
    ]);
  });

  it('removes framework-copied environment files but leaves other violations visible', async () => {
    const root = await artifactDir();
    await mkdir(path.join(root, 'nested'), { recursive: true });
    await writeFile(path.join(root, '.env'), 'DATABASE_URL=secret');
    await writeFile(path.join(root, 'nested', '.env.production'), 'AUTH_SECRET=secret');
    await writeFile(path.join(root, 'deploy.key'), 'secret');

    await expect(removeCopiedEnvironmentFiles(root)).resolves.toEqual([
      '.env',
      path.join('nested', '.env.production'),
    ]);
    await expect(findForbiddenArtifactFiles(root)).resolves.toEqual(['deploy.key']);
  });
});
