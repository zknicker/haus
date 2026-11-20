import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, realpathSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { workerLayout } from './layout.ts';
import { resolveWorkerRepo } from './repos.ts';
import { addWorkerWorktree, removeWorkerWorktree, worktreeGitRoots } from './worktree.ts';

let root: string;
let remotes: string;
let dataRoot: string;

const git = (cwd: string, ...args: string[]) => {
    const result = Bun.spawnSync(
        ['git', '-c', 'user.name=Test', '-c', 'user.email=test@haus.test', ...args],
        { cwd, stderr: 'pipe', stdout: 'pipe' }
    );
    if (result.exitCode !== 0) {
        throw new Error(`git ${args.join(' ')}: ${result.stderr.toString()}`);
    }
    return result.stdout.toString().trim();
};
const remoteUrl = (repository: string) => join(remotes, `${repository}.git`);

beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'haus-worktree-')));
    remotes = join(root, 'remotes');
    dataRoot = join(root, 'data');
    const seed = join(root, 'seed');
    git(root, 'init', '--quiet', '--initial-branch', 'main', seed);
    git(seed, 'commit', '--quiet', '--allow-empty', '-m', 'first');
    git(seed, 'checkout', '--quiet', '-b', 'feature');
    git(seed, 'commit', '--quiet', '--allow-empty', '-m', 'feature work');
    git(seed, 'checkout', '--quiet', 'main');
    git(root, 'clone', '--quiet', '--bare', seed, remoteUrl('acme/app'));
});
afterEach(async () => {
    await rm(root, { force: true, recursive: true });
});

const source = { checkoutPath: null, repository: 'acme/app' };

describe('Worker repos', () => {
    test('concurrent first uses share one clone in the data root', async () => {
        const [first, second] = await Promise.all([
            resolveWorkerRepo(source, { dataRoot, remoteUrl }),
            resolveWorkerRepo(source, { dataRoot, remoteUrl }),
        ]);
        expect(first).toBe(join(dataRoot, 'repos', 'acme', 'app'));
        expect(second).toBe(first);
        expect(git(first, 'log', '--format=%s', 'origin/main')).toBe('first');
    });

    test('a linked checkout of another repository is refused', async () => {
        const other = join(root, 'other');
        git(root, 'clone', '--quiet', remoteUrl('acme/app'), other);
        git(other, 'remote', 'set-url', 'origin', 'https://github.com/acme/elsewhere.git');
        const refusal = await resolveWorkerRepo(
            { checkoutPath: other, repository: 'acme/app' },
            { dataRoot, remoteUrl }
        ).catch((error: Error) => error.message);
        expect(refusal).toBe(
            `${other} is a clone of https://github.com/acme/elsewhere.git, not acme/app.`
        );
    });
});

describe('Worker worktrees', () => {
    test('a first turn branches from the remote default, and later turns reuse it', async () => {
        const repoPath = await resolveWorkerRepo(source, { dataRoot, remoteUrl });
        const { checkout } = workerLayout(dataRoot, 'srv_1', 'wrk_1');
        const request = { branch: 'haus/sec-12-wrk_1', checkout, repoPath, startingRef: null };
        await addWorkerWorktree(request);
        git(checkout, 'commit', '--quiet', '--allow-empty', '-m', 'worker commit');
        await addWorkerWorktree(request);

        expect(git(checkout, 'branch', '--show-current')).toBe('haus/sec-12-wrk_1');
        expect(git(checkout, 'log', '--format=%s')).toBe('worker commit\nfirst');
        expect(Bun.spawnSync(['git', 'rev-parse', '@{u}'], { cwd: checkout }).exitCode).toBe(128);
        expect(await worktreeGitRoots(checkout)).toEqual([
            join(repoPath, '.git', 'worktrees', 'checkout'),
            join(repoPath, '.git', 'objects'),
            join(repoPath, '.git', 'refs'),
            join(repoPath, '.git', 'logs'),
        ]);
    });

    test('a starting ref names the remote branch, and an unknown one refuses', async () => {
        const repoPath = await resolveWorkerRepo(source, { dataRoot, remoteUrl });
        const { checkout } = workerLayout(dataRoot, 'srv_1', 'wrk_2');
        await addWorkerWorktree({ branch: 'haus/b', checkout, repoPath, startingRef: 'feature' });
        const missing = await addWorkerWorktree({
            branch: 'haus/c',
            checkout: join(root, 'missing'),
            repoPath,
            startingRef: 'nope',
        }).catch((error: Error) => error.message);

        expect(git(checkout, 'log', '--format=%s', '-1')).toBe('feature work');
        expect(missing).toBe('The starting ref nope does not exist.');
    });

    test('close removes the worktree twice over and keeps the branch', async () => {
        const repoPath = await resolveWorkerRepo(source, { dataRoot, remoteUrl });
        const { checkout } = workerLayout(dataRoot, 'srv_1', 'wrk_3');
        await addWorkerWorktree({ branch: 'haus/d', checkout, repoPath, startingRef: null });
        await removeWorkerWorktree({ checkout, repoPath });
        await removeWorkerWorktree({ checkout, repoPath });

        expect(existsSync(checkout)).toBe(false);
        expect(git(repoPath, 'worktree', 'list', '--porcelain').includes(checkout)).toBe(false);
        expect(git(repoPath, 'branch', '--list', 'haus/d')).toBe('haus/d');
    });
});
