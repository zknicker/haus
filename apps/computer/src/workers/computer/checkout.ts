import { randomUUID } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { serialized } from '../serialized.ts';
import { gitSucceeds, runGit, WorkerCheckoutError } from './git.ts';

export interface CheckoutRequest {
    branch: string;
    checkout: string;
    repoPath: string;
    signal?: AbortSignal;
    startingRef: string | null;
}

export function addWorkerCheckout(request: CheckoutRequest) {
    const { branch, checkout, repoPath, signal } = request;
    return serialized(`repo:${repoPath}`, async () => {
        if (existsSync(join(checkout, '.git'))) {
            return;
        }
        await rm(checkout, { force: true, recursive: true });
        await runGit(['fetch', 'origin'], { action: 'fetch origin', cwd: repoPath, signal });
        const start = await startCommit(request);
        const staging = join(dirname(checkout), `.checkout-${randomUUID()}`);
        try {
            await cloneCheckout({ branch, repoPath, signal, staging, start });
            await rename(staging, checkout);
        } finally {
            await rm(staging, { force: true, recursive: true });
        }
    });
}

export function removeWorkerCheckout(input: {
    checkout: string;
    repoPath: string | null;
    workerId: string;
}) {
    const { checkout, repoPath, workerId } = input;
    const remove = async () => {
        const repo = repoPath !== null && existsSync(repoPath) ? repoPath : null;
        if (isOwnClone(checkout)) {
            if (repo === null) {
                throw new WorkerCheckoutError(
                    `The repo clone of ${workerId} is gone, so its checkout stays.`
                );
            }
            await keepBranches(checkout, repo, workerId);
        } else if (repo !== null && existsSync(checkout)) {
            await gitSucceeds(['worktree', 'remove', '--force', checkout], repo);
        }
        await rm(checkout, { force: true, recursive: true });
        if (repo !== null) {
            await gitSucceeds(['worktree', 'prune'], repo);
        }
    };
    return repoPath === null ? remove() : serialized(`repo:${repoPath}`, remove);
}

export async function checkoutGitRoots(checkout: string, branch: string) {
    if (isOwnClone(checkout)) {
        return [join(checkout, '.git')];
    }
    const read = (flag: string) =>
        runGit(['rev-parse', '--path-format=absolute', flag], {
            action: 'read the worktree git dirs',
            cwd: checkout,
        });
    const [gitDir, common] = await Promise.all([read('--git-dir'), read('--git-common-dir')]);
    const refDir = ownRefDir(branch);
    const ownRefs = refDir
        ? [join(common, 'refs', 'heads', refDir), join(common, 'logs', 'refs', 'heads', refDir)]
        : [];
    return [gitDir, join(common, 'objects'), ...ownRefs];
}

async function keepBranches(checkout: string, repo: string, workerId: string) {
    const own = `refs/heads/haus/${workerId}/`;
    const git = (action: string, ...args: string[]) => runGit(args, { action, cwd: checkout });
    const refs = await git(
        'read the checkout branches',
        'for-each-ref',
        '--format=%(refname)',
        'refs/heads'
    );
    const detached = !(await gitSucceeds(['symbolic-ref', '--quiet', 'HEAD'], checkout));
    const refspecs: string[] = [];
    for (const ref of [...refs.split('\n').filter(Boolean), ...(detached ? ['HEAD'] : [])]) {
        if (ref.startsWith(own)) {
            refspecs.push(`+${ref}:${ref}`);
        } else if (await hasUnpushedCommits(checkout, ref)) {
            const name = ref === 'HEAD' ? 'detached-head' : ref.slice('refs/heads/'.length);
            refspecs.push(`+${ref}:${own}kept/${name}`);
        }
    }
    if (refspecs.length === 0) {
        return;
    }
    const kept = await gitSucceeds(
        ['fetch', '--quiet', '--no-write-fetch-head', checkout, ...refspecs],
        repo
    );
    if (!kept) {
        throw new WorkerCheckoutError(`Could not keep the branches of ${workerId}.`);
    }
}

async function hasUnpushedCommits(checkout: string, ref: string) {
    const count = await runGit(['rev-list', '--count', ref, '--not', '--remotes'], {
        action: `count the commits only ${ref} holds`,
        cwd: checkout,
    });
    return Number(count) > 0;
}

async function cloneCheckout(input: {
    branch: string;
    repoPath: string;
    signal?: AbortSignal;
    staging: string;
    start: string;
}) {
    const { branch, repoPath, signal, staging, start } = input;
    const common = await runGit(['rev-parse', '--path-format=absolute', '--git-common-dir'], {
        action: 'read the git dir of the repo',
        cwd: repoPath,
        signal,
    });
    await runGit(['clone', '--quiet', '--no-checkout', '--', repoPath, staging], {
        action: 'clone the checkout',
        signal,
    });
    const git = (action: string, ...args: string[]) =>
        runGit(args, { action, cwd: staging, signal });
    const inherited = await git('read the cloned branches', 'branch', '--format=%(refname:short)');
    await git('detach the clone', 'update-ref', '--no-deref', 'HEAD', start);
    for (const name of inherited.split('\n').filter(Boolean)) {
        await git(`drop the cloned branch ${name}`, 'branch', '--quiet', '-D', name);
    }
    await git('drop the clone origin', 'config', '--remove-section', 'remote.origin');
    await git('include the repo config', 'config', 'include.path', join(common, 'config'));
    await git('fetch origin', 'fetch', '--quiet', '--prune', 'origin');
    await git(`check out ${branch}`, 'checkout', '--quiet', '--no-track', '-b', branch, start);
}

async function startCommit(request: CheckoutRequest) {
    const { branch, repoPath, signal } = request;
    const kept = `refs/heads/${branch}`;
    const named = (await gitSucceeds(['show-ref', '--verify', '--quiet', kept], repoPath))
        ? kept
        : await startPoint(repoPath, request.startingRef, signal);
    return await runGit(['rev-parse', '--verify', '--end-of-options', `${named}^{commit}`], {
        action: `read ${named}`,
        cwd: repoPath,
        signal,
    });
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

function isOwnClone(checkout: string) {
    const git = join(checkout, '.git');
    return existsSync(git) && statSync(git).isDirectory();
}

function ownRefDir(branch: string) {
    const parts = branch.split('/');
    return parts.length === 3 && parts[0] === 'haus' && parts.every(Boolean)
        ? `${parts[0]}/${parts[1]}`
        : null;
}
