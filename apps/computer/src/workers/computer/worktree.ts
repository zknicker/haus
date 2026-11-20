import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { serialized } from '../serialized.ts';
import { gitSucceeds, runGit, WorkerCheckoutError } from './git.ts';

export interface WorktreeRequest {
    branch: string;
    checkout: string;
    repoPath: string;
    signal?: AbortSignal;
    startingRef: string | null;
}

export function addWorkerWorktree(request: WorktreeRequest) {
    const { branch, checkout, repoPath, signal } = request;
    return serialized(`repo:${repoPath}`, async () => {
        if (existsSync(join(checkout, '.git'))) {
            return;
        }
        await rm(checkout, { force: true, recursive: true });
        await runGit(['worktree', 'prune'], { action: 'prune worktrees', cwd: repoPath, signal });
        await runGit(['fetch', 'origin'], {
            action: 'fetch origin',
            cwd: repoPath,
            signal,
        });
        const exists = await gitSucceeds(
            ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`],
            repoPath
        );
        const add = exists
            ? ['worktree', 'add', checkout, branch]
            : [
                  'worktree',
                  'add',
                  '--no-track',
                  '-b',
                  branch,
                  checkout,
                  await startPoint(repoPath, request.startingRef, signal),
              ];
        await runGit(add, { action: `add the worktree for ${branch}`, cwd: repoPath, signal });
    });
}

export function removeWorkerWorktree(input: { checkout: string; repoPath: string | null }) {
    const { checkout, repoPath } = input;
    const remove = async () => {
        const repo = repoPath !== null && existsSync(repoPath) ? repoPath : null;
        if (repo !== null && existsSync(checkout)) {
            await gitSucceeds(['worktree', 'remove', '--force', checkout], repo);
        }
        await rm(checkout, { force: true, recursive: true });
        if (repo !== null) {
            await gitSucceeds(['worktree', 'prune'], repo);
        }
    };
    return repoPath === null ? remove() : serialized(`repo:${repoPath}`, remove);
}

export async function worktreeGitRoots(checkout: string) {
    const read = (flag: string) =>
        runGit(['rev-parse', '--path-format=absolute', flag], {
            action: 'read the worktree git dirs',
            cwd: checkout,
        });
    const [gitDir, common] = await Promise.all([read('--git-dir'), read('--git-common-dir')]);
    return [gitDir, join(common, 'objects'), join(common, 'refs'), join(common, 'logs')];
}

async function startPoint(repoPath: string, ref: string | null, signal?: AbortSignal) {
    if (ref === null) {
        await runGit(['remote', 'set-head', 'origin', '--auto'], {
            action: 'read the default branch of origin',
            cwd: repoPath,
            signal,
        });
        return await runGit(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], {
            action: 'read the default branch of origin',
            cwd: repoPath,
            signal,
        });
    }
    for (const candidate of [`origin/${ref}`, ref]) {
        if (
            await gitSucceeds(
                ['rev-parse', '--verify', '--quiet', '--end-of-options', `${candidate}^{commit}`],
                repoPath
            )
        ) {
            return candidate;
        }
    }
    throw new WorkerCheckoutError(`The starting ref ${ref} does not exist.`);
}
