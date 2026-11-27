import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { agentWorktreeIdleMs } from '@haus/api';
import { withAgentUse } from './agent-use.ts';
import {
    agentCheckoutText,
    agentWorktreeOf,
    checkoutAgentWorktree,
    pruneIdleAgentWorktrees,
    removeAgentWorktrees,
    removeArchivedWorktrees,
} from './agent-worktrees.ts';
import { githubAppGit } from './github-git.ts';
import { git, registerRepoFixture } from './repo.fixture.ts';
import { lastUseMs, worktreeGitDirs } from './worktree-marker.ts';

const repos = registerRepoFixture();
const agentId = 'agt_alpha';

function setup() {
    const fixture = repos();
    const folder = fixture.folder();
    const checkout = (ref: string | null = null, sessionGeneration = 1) =>
        checkoutAgentWorktree({
            agentId,
            dataRoot: fixture.dataRoot,
            folder,
            git: githubAppGit(fixture.dataRoot, 'srv_1', {
                access: 'write',
                invocationId: 'inv_checkout',
            }),
            ref,
            repository: 'acme/app',
            serverId: 'srv_1',
            sessionGeneration,
        });
    const path = join(fixture.dataRoot, 'servers', 'srv_1', 'worktrees', agentId, 'acme', 'app');
    return { ...fixture, checkout, folder, path };
}

describe('haus repo checkout', () => {
    test("makes the Agent's worktree on its named branch off the remote default, and reuses it", async () => {
        const { checkout, folder, path } = setup();
        const first = await checkout();
        git(path, 'commit', '--quiet', '--allow-empty', '-m', 'agent work');
        const second = await checkout();

        expect(first).toEqual({
            branch: 'haus/agt_alpha/app',
            from: 'origin/main',
            path,
            reused: false,
        });
        expect(second).toMatchObject({ reused: true });
        expect(git(path, 'log', '--format=%s')).toBe('agent work\nfirst');
        expect(git(folder, 'branch', '--list', 'haus/*')).toBe('+ haus/agt_alpha/app');
        expect(agentCheckoutText(first)).toBe(
            [
                `Made the worktree ${path} on haus/agt_alpha/app, from origin/main.`,
                `Run \`cd ${path}\` to work there. Once nothing in it is uncommitted or unpushed, it goes 7 days after its last use; the branch stays.`,
            ].join('\n')
        );
    });

    test('a fetch the Captain cannot make refuses with the reason and makes nothing', async () => {
        const { checkout, cutOff, folder, path } = setup();
        cutOff(folder);
        const refused = await checkout().catch((error: Error) => error.message);

        expect(refused).toStartWith(`Could not fetch acme/app into ${folder}: `);
        expect(existsSync(path)).toBe(false);
    });

    test('a new --ref moves a clean worktree, and refuses one with unpushed work', async () => {
        const { checkout, path } = setup();
        await checkout();
        const moved = await checkout('feature');
        git(path, 'commit', '--quiet', '--allow-empty', '-m', 'unpushed');
        const refused = await checkout('main').catch((error: Error) => error.message);

        expect(moved).toMatchObject({ from: 'origin/feature', reused: true });
        expect(refused).toBe(
            `${path} has uncommitted or unpushed work on haus/agt_alpha/app, so it was not moved to main. Commit and push it first, or check out without --ref.`
        );
        expect(git(path, 'log', '--format=%s', '-1')).toBe('unpushed');
    });

    test('a folder whose origin is another repo is refused', async () => {
        const { checkout, folder } = setup();
        git(folder, 'remote', 'set-url', 'origin', 'git@github.com:acme/other.git');

        expect(await checkout().catch((error: Error) => error.message)).toBe(
            `${folder} is a clone of git@github.com:acme/other.git, not acme/app.`
        );
    });
});

describe('Agent worktree cleanup', () => {
    test('the sweep removes a clean worktree unused for 7 days and keeps its branch', async () => {
        const { checkout, dataRoot, folder, path } = setup();
        await checkout();
        const last = await lastUseMs(path);
        const early = await pruneIdleAgentWorktrees({
            dataRoot,
            now: (last ?? 0) + agentWorktreeIdleMs - 1000,
            serverId: 'srv_1',
        });
        const late = await pruneIdleAgentWorktrees({
            dataRoot,
            now: (last ?? 0) + agentWorktreeIdleMs + 1000,
            serverId: 'srv_1',
        });

        expect(early).toEqual([]);
        expect(late).toEqual([path]);
        expect(existsSync(join(dataRoot, 'servers', 'srv_1', 'worktrees'))).toBe(true);
        expect(existsSync(join(dataRoot, 'servers', 'srv_1', 'worktrees', agentId))).toBe(false);
        expect(git(folder, 'branch', '--list', 'haus/*')).toBe('haus/agt_alpha/app');
    });

    test('the sweep and retirement keep a worktree with uncommitted work', async () => {
        const { checkout, dataRoot, path } = setup();
        await checkout();
        await writeFile(join(path, 'draft.md'), 'not committed');
        const dirs = await worktreeGitDirs(path);
        const old = new Date(Date.now() - 2 * agentWorktreeIdleMs);
        for (const file of ['haus-worktree.json', 'index']) {
            await utimes(join(dirs?.admin ?? '', file), old, old);
        }

        expect(await pruneIdleAgentWorktrees({ dataRoot, serverId: 'srv_1' })).toEqual([]);
        expect(await removeAgentWorktrees({ agentId, dataRoot, serverId: 'srv_1' })).toEqual([
            path,
        ]);
        expect(existsSync(join(path, 'draft.md'))).toBe(true);
    });

    test('an archived Task loses its clean worktree and branch, and keeps an unpushed one', async () => {
        const clean = setup();
        await clean.checkout();
        expect(
            await removeArchivedWorktrees({
                agentId,
                dataRoot: clean.dataRoot,
                generation: 1,
                serverId: 'srv_1',
            })
        ).toEqual([]);
        expect(existsSync(clean.path)).toBe(false);
        expect(git(clean.folder, 'branch', '--list', 'haus/*')).toBe('');

        const unpushed = setup();
        await unpushed.checkout();
        git(unpushed.path, 'commit', '--quiet', '--allow-empty', '-m', 'unpushed');
        expect(
            await removeArchivedWorktrees({
                agentId,
                dataRoot: unpushed.dataRoot,
                generation: 1,
                serverId: 'srv_1',
            })
        ).toEqual([unpushed.path]);
        expect(git(unpushed.path, 'log', '--format=%s', '-1')).toBe('unpushed');
    });

    test('a late archive cleanup spares the worktree a restored, newer session checked out', async () => {
        const restored = setup();
        await restored.checkout(null, 1);
        await restored.checkout(null, 3);
        expect(
            await removeArchivedWorktrees({
                agentId,
                dataRoot: restored.dataRoot,
                generation: 2,
                serverId: 'srv_1',
            })
        ).toEqual([]);
        expect(existsSync(restored.path)).toBe(true);
    });

    test('the sweep keeps what an invocation writes while it waits for that invocation', async () => {
        const { checkout, dataRoot, path } = setup();
        await checkout();
        const dirs = await worktreeGitDirs(path);
        const old = new Date(Date.now() - 2 * agentWorktreeIdleMs);
        for (const file of ['haus-worktree.json', 'index']) {
            await utimes(join(dirs?.admin ?? '', file), old, old);
        }
        const gate = Promise.withResolvers<void>();
        const invocation = withAgentUse(agentId, async () => {
            await gate.promise;
            await writeFile(join(path, 'fresh.md'), 'written during the sweep');
        });
        const sweep = pruneIdleAgentWorktrees({ dataRoot, serverId: 'srv_1' });
        gate.resolve();
        await invocation;

        expect(await sweep).toEqual([]);
        expect(existsSync(join(path, 'fresh.md'))).toBe(true);
    });

    test('a path inside an Agent worktree names it; other worktrees and paths do not', () => {
        const root = '/data/servers/srv_1/worktrees';

        expect(agentWorktreeOf(`${root}/agt_alpha/acme/app/src/index.ts`, root)).toBe(
            `${root}/agt_alpha/acme/app`
        );
        expect(agentWorktreeOf(`${root}/agt_alpha/acme/app`, root)).toBe(
            `${root}/agt_alpha/acme/app`
        );
        expect(agentWorktreeOf(`${root}/wrk_1/acme/app/a.ts`, root)).toBeNull();
        expect(agentWorktreeOf(`${root}/agt_alpha/acme`, root)).toBeNull();
        expect(
            agentWorktreeOf('/data/servers/srv_1/agents/agt_alpha/workspace/a.ts', root)
        ).toBeNull();
    });
});
