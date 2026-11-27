import { existsSync, realpathSync } from 'node:fs';
import { mkdir, rm, rmdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { hasCode } from '../durable-json.ts';
import { serialized } from '../serialized.ts';
import { type GitCredentials, gitOutput, gitSucceeds, runGit, RepoCheckoutError } from './git.ts';
import { directories } from './repo-clones.ts';
import { readMarker, worktreeGitDirs, writeMarker } from './worktree-marker.ts';

export interface WorktreeStart {
    branch: string;
    credentials: GitCredentials;
    fetch: 'required' | 'best-effort' | 'done';
    folder: string;
    path: string;
    ref: string | null;
    signal?: AbortSignal;
}

export type WorktreeState = Awaited<ReturnType<typeof worktreeState>>;

export async function addWorktree(start: WorktreeStart) {
    return await withFolderLock(start.folder, async () => {
        if (existsSync(join(start.path, '.git'))) {
            return { branchKept: true, created: false, fetched: null, start: start.branch };
        }
        const git = (action: string, ...args: string[]) =>
            runGit(args, {
                action,
                credentials: start.credentials,
                cwd: start.folder,
                signal: start.signal,
            });
        await rm(start.path, { force: true, recursive: true });
        await git('prune stale worktrees', 'worktree', 'prune');
        const fetched =
            start.fetch === 'done' ||
            (start.fetch === 'required'
                ? await git('fetch origin', 'fetch', '--quiet', 'origin').then(() => true)
                : await fetchFolder(start.folder, start.credentials, start.signal));
        start.signal?.throwIfAborted();
        const branchKept = await gitSucceeds(
            ['show-ref', '--verify', '--quiet', `refs/heads/${start.branch}`],
            start.folder
        );
        const from = branchKept ? start.branch : await startPoint(start);
        const action = `add the worktree on ${start.branch}`;
        await mkdir(dirname(start.path), { mode: 0o700, recursive: true });
        await (branchKept
            ? git(action, 'worktree', 'add', '--quiet', start.path, start.branch)
            : git(
                  action,
                  'worktree',
                  'add',
                  '--quiet',
                  '--no-track',
                  '-b',
                  start.branch,
                  start.path,
                  from
              ));
        await writeMarker(start.path, { branch: start.branch, ref: start.ref });
        return { branchKept, created: true, fetched, start: from };
    });
}

export async function worktreeState(
    path: string,
    credentials: GitCredentials | 'fetched',
    signal?: AbortSignal
) {
    if (!existsSync(path)) {
        return 'gone' as const;
    }
    if ((await worktreeGitDirs(path)) === null) {
        return 'broken' as const;
    }
    if (credentials !== 'fetched' && !(await fetchFolder(path, credentials, signal))) {
        return 'dirty' as const;
    }
    return (await hasLocalWork(path)) ? ('dirty' as const) : ('clean' as const);
}

export async function hasLocalWork(path: string) {
    const git = (...args: string[]) => gitOutput(args, path);
    if ((await git('status', '--porcelain', '--untracked-files=all')) !== '') {
        return true;
    }
    const marker = await readMarker(path);
    for (const ref of ['HEAD', ...(marker ? [`refs/heads/${marker.branch}`] : [])]) {
        if ((await git('rev-parse', '--verify', '--quiet', ref)) === null) {
            continue;
        }
        if ((await git('rev-list', '--count', ref, '--not', '--remotes')) !== '0') {
            return true;
        }
    }
    return false;
}

export async function removeCleanWorktree(input: {
    credentials: GitCredentials | 'fetched';
    deleteBranch: boolean;
    path: string;
    root: string;
}) {
    const dirs = existsSync(input.path) ? await worktreeGitDirs(input.path) : null;
    const state = dirs
        ? await serialized(lockKey(dirs.common), async () => {
              const current = await worktreeState(input.path, input.credentials);
              if (current === 'clean') {
                  await removeWorktree(input.path, dirs.common, input.deleteBranch);
              }
              return current;
          })
        : await worktreeState(input.path, input.credentials);
    if (state === 'clean' || state === 'gone') {
        await removeEmptyFolders(dirname(input.path), input.root);
    }
    return state;
}

export async function removeCleanWorktreesOf(
    root: string,
    id: string,
    options: {
        credentials: GitCredentials | 'fetched';
        deleteBranch: boolean;
        spare?: (path: string) => Promise<boolean>;
    }
) {
    const kept: string[] = [];
    for (const worktree of (await listWorktrees(root)).filter((found) => found.id === id)) {
        if (await options.spare?.(worktree.path)) {
            continue;
        }
        const state = await removeCleanWorktree({
            credentials: options.credentials,
            deleteBranch: options.deleteBranch,
            path: worktree.path,
            root,
        });
        if (state === 'dirty' || state === 'broken') {
            kept.push(worktree.path);
        }
    }
    for (const owner of await directories(join(root, id))) {
        await removeEmptyFolders(join(root, id, owner), root);
    }
    await removeEmptyFolders(join(root, id), root);
    return kept;
}

export async function listWorktrees(root: string) {
    const found: Array<{ id: string; path: string; repository: string }> = [];
    for (const id of await directories(root)) {
        for (const owner of await directories(join(root, id))) {
            for (const name of await directories(join(root, id, owner))) {
                found.push({
                    id,
                    path: join(root, id, owner, name),
                    repository: `${owner}/${name}`,
                });
            }
        }
    }
    return found;
}

export async function commonDirOf(path: string) {
    const common = await runGit(['rev-parse', '--path-format=absolute', '--git-common-dir'], {
        action: `read the git dir of ${path}`,
        cwd: path,
    });
    return realpathSync(common);
}

export async function withFolderLock<T>(folder: string, work: () => Promise<T>) {
    return await serialized(lockKey(await commonDirOf(folder)), work);
}

export async function fetchFolder(cwd: string, credentials: GitCredentials, signal?: AbortSignal) {
    return await runGit(['fetch', '--quiet', 'origin'], {
        action: 'fetch origin',
        credentials,
        cwd,
        signal,
    }).then(
        () => true,
        () => false
    );
}

export async function startPoint(start: Pick<WorktreeStart, 'credentials' | 'folder' | 'ref'>) {
    const { folder, ref } = start;
    if (ref === null) {
        await gitSucceeds(['remote', 'set-head', 'origin', '--auto'], folder, start.credentials);
        return await runGit(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], {
            action: 'read the default branch of origin',
            cwd: folder,
        });
    }
    for (const candidate of [`origin/${ref}`, ref]) {
        if (
            await gitSucceeds(
                ['rev-parse', '--verify', '--quiet', '--end-of-options', `${candidate}^{commit}`],
                folder
            )
        ) {
            return candidate;
        }
    }
    throw new RepoCheckoutError(`The starting ref ${ref} does not exist.`);
}

export async function removeEmptyFolders(folder: string, root: string) {
    for (let current = folder; current.startsWith(`${root}/`); current = dirname(current)) {
        const removed = await rmdir(current).then(
            () => true,
            (cause: unknown) => {
                if (hasCode(cause, 'ENOENT')) {
                    return true;
                }
                if (hasCode(cause, 'ENOTEMPTY') || hasCode(cause, 'EEXIST')) {
                    return false;
                }
                throw cause;
            }
        );
        if (!removed) {
            return;
        }
    }
}

async function removeWorktree(path: string, common: string, deleteBranch: boolean) {
    const marker = deleteBranch ? await readMarker(path) : null;
    await runGit(['worktree', 'remove', '--force', path], {
        action: `remove the worktree ${path}`,
        cwd: common,
    });
    if (marker) {
        await gitSucceeds(['branch', '--quiet', '-D', marker.branch], common);
    }
    await gitSucceeds(['worktree', 'prune'], common);
}

function lockKey(common: string) {
    return `repo:${common}`;
}
