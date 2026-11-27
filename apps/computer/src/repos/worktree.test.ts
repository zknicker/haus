import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { worktreePath } from './layout.ts';
import { listWorktrees } from './worktree.ts';

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

test('a .github repo is listed like any other, and a staging clone is not', async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), 'haus-worktrees-'));
    roots.push(dataRoot);
    const github = worktreePath(dataRoot, 'srv_1', 'agt_alpha', 'acme/.github');
    await mkdir(github, { recursive: true });
    await mkdir(join(github, '..', '.app.0d1f.clone'), { recursive: true });

    expect(await listWorktrees(join(dataRoot, 'servers', 'srv_1', 'worktrees'))).toEqual([
        { id: 'agt_alpha', path: github, repository: 'acme/.github' },
    ]);
    expect(() => worktreePath(dataRoot, 'srv_1', 'agt_alpha', 'acme/..')).toThrow();
});
