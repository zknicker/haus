import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, realpathSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addWorkerCheckout, checkoutGitRoots, removeWorkerCheckout } from './checkout.ts';
import { workerLayout } from './layout.ts';
import { resolveWorkerRepo } from './repos.ts';

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
    root = realpathSync(mkdtempSync(join(tmpdir(), 'haus-checkout-')));
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

describe('Worker checkouts', () => {
    test('a first turn clones its own checkout off the remote default, and later turns reuse it', async () => {
        const repoPath = await resolveWorkerRepo(source, { dataRoot, remoteUrl });
        const { checkout } = workerLayout(dataRoot, 'srv_1', 'wrk_1');
        const request = { branch: 'haus/wrk_1/sec-12', checkout, repoPath, startingRef: null };
        await addWorkerCheckout(request);
        git(checkout, 'commit', '--quiet', '--allow-empty', '-m', 'worker commit');
        await addWorkerCheckout(request);

        expect(git(checkout, 'branch', '--format=%(refname:short)')).toBe('haus/wrk_1/sec-12');
        expect(git(checkout, 'log', '--format=%s')).toBe('worker commit\nfirst');
        expect(git(checkout, 'remote', 'get-url', 'origin')).toBe(remoteUrl('acme/app'));
        expect(git(checkout, 'log', '--format=%s', 'origin/feature')).toBe('feature work\nfirst');
        expect(Bun.spawnSync(['git', 'rev-parse', '@{u}'], { cwd: checkout }).exitCode).toBe(128);
        expect(git(repoPath, 'branch', '--list', 'haus/*')).toBe('');
        expect(await checkoutGitRoots(checkout, 'haus/wrk_1/sec-12')).toEqual([
            join(checkout, '.git'),
        ]);
    });

    test('the Worker deletes, packs and fetches refs only inside its own clone', async () => {
        const repoPath = await resolveWorkerRepo(source, { dataRoot, remoteUrl });
        const { checkout } = workerLayout(dataRoot, 'srv_1', 'wrk_4');
        await addWorkerCheckout({ branch: 'haus/wrk_4/e', checkout, repoPath, startingRef: null });
        git(checkout, 'branch', 'haus/wrk_4/scratch');
        git(checkout, 'branch', '-D', 'haus/wrk_4/scratch');
        git(checkout, 'pack-refs', '--all');
        git(checkout, 'fetch', '--quiet', 'origin');
        git(checkout, 'push', '--quiet', '-u', 'origin', 'HEAD');

        expect(git(repoPath, 'show-ref')).not.toContain('haus/');
        expect(git(repoPath, 'config', '--get-regexp', '^branch\\.').includes('haus/')).toBe(false);
        expect(git(checkout, 'rev-parse', '--abbrev-ref', '@{u}')).toBe('origin/haus/wrk_4/e');
    });

    test('a starting ref names the remote branch, and an unknown one refuses', async () => {
        const repoPath = await resolveWorkerRepo(source, { dataRoot, remoteUrl });
        const { checkout } = workerLayout(dataRoot, 'srv_1', 'wrk_2');
        await addWorkerCheckout({ branch: 'haus/b', checkout, repoPath, startingRef: 'feature' });
        const missing = await addWorkerCheckout({
            branch: 'haus/c',
            checkout: join(root, 'missing'),
            repoPath,
            startingRef: 'nope',
        }).catch((error: Error) => error.message);

        expect(git(checkout, 'log', '--format=%s', '-1')).toBe('feature work');
        expect(missing).toBe('The starting ref nope does not exist.');
        expect(existsSync(join(root, 'missing'))).toBe(false);
    });

    test('close keeps the Worker branches in the repo clone, twice over, and a new checkout resumes them', async () => {
        const repoPath = await resolveWorkerRepo(source, { dataRoot, remoteUrl });
        const { checkout } = workerLayout(dataRoot, 'srv_1', 'wrk_3');
        const request = { branch: 'haus/wrk_3/d', checkout, repoPath, startingRef: null };
        await addWorkerCheckout(request);
        git(checkout, 'commit', '--quiet', '--allow-empty', '-m', 'kept work');
        git(checkout, 'branch', 'scratch', 'origin/main');
        git(checkout, 'switch', '--quiet', '-c', 'fix/login');
        git(checkout, 'commit', '--quiet', '--allow-empty', '-m', 'login fix');
        git(checkout, 'switch', '--quiet', '--detach');
        git(checkout, 'commit', '--quiet', '--allow-empty', '-m', 'detached work');
        await removeWorkerCheckout({ checkout, repoPath, workerId: 'wrk_3' });
        await removeWorkerCheckout({ checkout, repoPath, workerId: 'wrk_3' });

        const subject = (ref: string) => git(repoPath, 'log', '--format=%s', '-1', ref);
        expect(existsSync(checkout)).toBe(false);
        expect(subject('haus/wrk_3/d')).toBe('kept work');
        expect(subject('haus/wrk_3/kept/fix/login')).toBe('login fix');
        expect(subject('haus/wrk_3/kept/detached-head')).toBe('detached work');
        expect(git(repoPath, 'branch', '--list', 'fix/login', 'scratch', '*/kept/scratch')).toBe(
            ''
        );

        await addWorkerCheckout(request);
        expect(git(checkout, 'log', '--format=%s', '-1')).toBe('kept work');
    });

    test('close leaves the checkout in place when its repo clone is gone', async () => {
        const repoPath = await resolveWorkerRepo(source, { dataRoot, remoteUrl });
        const { checkout } = workerLayout(dataRoot, 'srv_1', 'wrk_6');
        await addWorkerCheckout({ branch: 'haus/wrk_6/g', checkout, repoPath, startingRef: null });
        git(checkout, 'commit', '--quiet', '--allow-empty', '-m', 'only here');
        await rm(repoPath, { force: true, recursive: true });

        for (const gone of [repoPath, null]) {
            const refused = await removeWorkerCheckout({
                checkout,
                repoPath: gone,
                workerId: 'wrk_6',
            })
                .then(() => null)
                .catch((error: Error) => error.message);
            expect(refused).toBe('The repo clone of wrk_6 is gone, so its checkout stays.');
        }
        expect(git(checkout, 'log', '--format=%s', '-1')).toBe('only here');
    });

    test('a checkout made as a git worktree keeps its git roots and removes as a worktree', async () => {
        const repoPath = await resolveWorkerRepo(source, { dataRoot, remoteUrl });
        const { checkout } = workerLayout(dataRoot, 'srv_1', 'wrk_5');
        git(repoPath, 'worktree', 'add', '--quiet', '-b', 'haus/wrk_5/f', checkout, 'origin/main');

        expect(await checkoutGitRoots(checkout, 'haus/wrk_5/f')).toEqual([
            join(repoPath, '.git', 'worktrees', 'checkout'),
            join(repoPath, '.git', 'objects'),
            join(repoPath, '.git', 'refs', 'heads', 'haus', 'wrk_5'),
            join(repoPath, '.git', 'logs', 'refs', 'heads', 'haus', 'wrk_5'),
        ]);
        await removeWorkerCheckout({ checkout, repoPath, workerId: 'wrk_5' });
        expect(existsSync(checkout)).toBe(false);
        expect(git(repoPath, 'worktree', 'list', '--porcelain').includes(checkout)).toBe(false);
        expect(git(repoPath, 'branch', '--list', 'haus/wrk_5/f')).toBe('haus/wrk_5/f');
    });
});
