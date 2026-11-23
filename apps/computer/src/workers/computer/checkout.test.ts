import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { git, githubUrl, registerRepoFixture } from '../../repos/repo.fixture.ts';
import {
    addWorkerWorktree,
    closeWorkerWorktrees,
    heldWorkerWorktrees,
    worktreeGitRoots,
} from './checkout.ts';
import { worktreePath } from './layout.ts';
import { resolveWorkerRepo } from './repos.ts';

const repos = registerRepoFixture();
const source = { checkoutPath: null, repository: 'acme/app' };

describe('Worker repos', () => {
    test("concurrent first uses share one Haus clone in the Server's partition, cloned once", async () => {
        const { dataRoot, remoteUrl } = repos();
        let clones = 0;
        const options = {
            dataRoot,
            onCloned: async () => {
                clones += 1;
            },
            remoteUrl,
            serverId: 'srv_1',
        };
        const [first, second] = await Promise.all([
            resolveWorkerRepo(source, options),
            resolveWorkerRepo(source, options),
        ]);

        expect(first).toBe(join(dataRoot, 'servers', 'srv_1', 'repos', 'acme', 'app'));
        expect(second).toBe(first);
        expect(clones).toBe(1);
        expect(git(first, 'config', '--get', 'remote.origin.url')).toBe(githubUrl);
        expect(git(first, 'log', '--format=%s', 'origin/main')).toBe('first');
    });

    test('a folder of another repository, or one that is gone, is refused with its path', async () => {
        const fixture = repos();
        const other = fixture.folder();
        git(other, 'remote', 'set-url', 'origin', 'https://github.com/acme/elsewhere.git');
        const options = { dataRoot: fixture.dataRoot, serverId: 'srv_1' };
        const refusal = (checkoutPath: string) =>
            resolveWorkerRepo({ checkoutPath, repository: 'acme/app' }, options).catch(
                (error: Error) => error.message
            );

        expect(await refusal(other)).toBe(
            `${other} is a clone of https://github.com/acme/elsewhere.git, not acme/app.`
        );
        expect(await refusal(join(fixture.root, 'moved'))).toBe(
            `The repo folder ${join(fixture.root, 'moved')} is gone.`
        );
    });
});

describe('Worker worktrees', () => {
    test("a first turn adds a worktree of the person's folder off the remote default, and later turns reuse it", async () => {
        const fixture = repos();
        const folder = fixture.folder();
        const path = worktreePath(fixture.dataRoot, 'srv_1', 'wrk_1', 'acme/app');
        const request = { branch: 'haus/wrk_1/sec-12', folder, path, startingRef: null };
        await addWorkerWorktree(request);
        git(path, 'commit', '--quiet', '--allow-empty', '-m', 'worker commit');
        const again = await addWorkerWorktree(request);

        expect(path).toBe(
            join(fixture.dataRoot, 'servers', 'srv_1', 'worktrees', 'wrk_1', 'acme', 'app')
        );
        expect(again.created).toBe(false);
        expect(git(path, 'log', '--format=%s')).toBe('worker commit\nfirst');
        expect(git(folder, 'log', '--format=%s', '-1', 'haus/wrk_1/sec-12')).toBe('worker commit');
        expect(Bun.spawnSync(['git', 'rev-parse', '@{u}'], { cwd: path }).exitCode).toBe(128);
        expect(await worktreeGitRoots(path)).toEqual([join(folder, '.git')]);
    });

    test('a starting ref names the remote branch, an unknown one refuses, and a failed fetch refuses', async () => {
        const fixture = repos();
        const folder = fixture.folder();
        const at = (id: string) => worktreePath(fixture.dataRoot, 'srv_1', id, 'acme/app');
        await addWorkerWorktree({
            branch: 'haus/b',
            folder,
            path: at('wrk_2'),
            startingRef: 'feature',
        });
        const missing = await addWorkerWorktree({
            branch: 'haus/c',
            folder,
            path: at('wrk_3'),
            startingRef: 'nope',
        }).catch((error: Error) => error.message);
        fixture.cutOff(folder);
        const offline = await addWorkerWorktree({
            branch: 'haus/d',
            folder,
            path: at('wrk_4'),
            startingRef: null,
        }).catch((error: Error) => error.message);

        expect(git(at('wrk_2'), 'log', '--format=%s', '-1')).toBe('feature work');
        expect(missing).toBe('The starting ref nope does not exist.');
        expect(offline).toStartWith('Could not fetch origin:');
        expect([existsSync(at('wrk_3')), existsSync(at('wrk_4'))]).toEqual([false, false]);
    });

    test('close removes a pushed worktree with its local branch, and keeps one with unpushed work', async () => {
        const fixture = repos();
        const folder = fixture.folder();
        const at = (id: string) => worktreePath(fixture.dataRoot, 'srv_1', id, 'acme/app');
        await addWorkerWorktree({
            branch: 'haus/wrk_5/e',
            folder,
            path: at('wrk_5'),
            startingRef: null,
        });
        git(at('wrk_5'), 'commit', '--quiet', '--allow-empty', '-m', 'pushed');
        git(at('wrk_5'), 'push', '--quiet', 'origin', 'HEAD');
        await addWorkerWorktree({
            branch: 'haus/wrk_6/f',
            folder,
            path: at('wrk_6'),
            startingRef: null,
        });
        git(at('wrk_6'), 'commit', '--quiet', '--allow-empty', '-m', 'only here');

        const closed = [
            await closeWorkerWorktrees(fixture.dataRoot, 'srv_1', 'wrk_5'),
            await closeWorkerWorktrees(fixture.dataRoot, 'srv_1', 'wrk_5'),
            await closeWorkerWorktrees(fixture.dataRoot, 'srv_1', 'wrk_6'),
        ];

        expect(closed).toEqual([[], [], [at('wrk_6')]]);
        expect(existsSync(join(fixture.dataRoot, 'servers', 'srv_1', 'worktrees', 'wrk_5'))).toBe(
            false
        );
        expect(git(folder, 'branch', '--list', 'haus/*')).toBe('+ haus/wrk_6/f');
        expect(await heldWorkerWorktrees(fixture.dataRoot, 'srv_1', [])).toEqual({
            keptWorktrees: [{ path: at('wrk_6'), workerId: 'wrk_6' }],
            workerIds: ['wrk_6'],
        });
    });

    test('close keeps a worktree whose folder is gone', async () => {
        const fixture = repos();
        const folder = fixture.folder();
        const path = worktreePath(fixture.dataRoot, 'srv_1', 'wrk_7', 'acme/app');
        await addWorkerWorktree({ branch: 'haus/wrk_7/g', folder, path, startingRef: null });
        await rm(folder, { force: true, recursive: true });

        expect(await closeWorkerWorktrees(fixture.dataRoot, 'srv_1', 'wrk_7')).toEqual([path]);
        expect(existsSync(join(path, '.git'))).toBe(true);
    });
});
