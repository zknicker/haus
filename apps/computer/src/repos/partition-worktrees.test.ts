import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { purgeRetiredAgent } from '../agent-retirement.ts';
import { pendingPurgeMarker, purgeServerPartition } from '../server-partition-purge.ts';
import { addWorkerWorktree } from '../workers/computer/checkout.ts';
import { worktreePath } from '../workers/computer/layout.ts';
import { resolveWorkerRepo } from '../workers/computer/repos.ts';
import { checkoutAgentWorktree } from './agent-worktrees.ts';
import { githubAppGit } from './github-git.ts';
import { git, registerRepoFixture } from './repo.fixture.ts';

const repos = registerRepoFixture();
const serverId = 'srv_1234567890abcdef';
const agentId = 'agt_aaaaaaaaaaaaaaaa';

describe('worktrees when a Server or an Agent goes', () => {
    test('a purge removes clean worktrees, keeps one with uncommitted work and the Haus clone it uses', async () => {
        const fixture = repos();
        const { dataRoot } = fixture;
        const person = fixture.folder();
        const clone = await resolveWorkerRepo(
            { checkoutPath: null, repository: 'acme/app' },
            { dataRoot, remoteUrl: fixture.remoteUrl, serverId }
        );
        await addWorkerWorktree({
            branch: 'haus/wrk_1/a',
            folder: clone,
            path: worktreePath(dataRoot, serverId, 'wrk_1', 'acme/app'),
            startingRef: null,
        });
        const kept = (
            await checkoutAgentWorktree({
                agentId,
                dataRoot,
                folder: clone,
                git: githubAppGit(dataRoot, serverId, { access: 'write', invocationId: 'inv_t' }),
                ref: null,
                repository: 'acme/app',
                sessionGeneration: 1,
                serverId,
            })
        ).path;
        await writeFile(join(kept, 'draft.md'), 'not committed');
        await checkoutAgentWorktree({
            agentId: 'agt_bbbbbbbbbbbbbbbb',
            dataRoot,
            folder: person,
            git: githubAppGit(dataRoot, serverId, { access: 'write', invocationId: 'inv_t' }),
            ref: null,
            repository: 'acme/app',
            sessionGeneration: 1,
            serverId,
        });
        await mkdir(join(dataRoot, 'servers', serverId, 'agents', agentId), { recursive: true });

        await purgeServerPartition({ dataRoot, disk: null, serverId });

        const partition = join(dataRoot, 'servers', serverId);
        expect((await readdir(partition)).sort()).toEqual([
            pendingPurgeMarker,
            'repos',
            'worktrees',
        ]);
        expect(await readdir(join(partition, 'worktrees'))).toEqual([agentId]);
        expect(existsSync(join(kept, 'draft.md'))).toBe(true);
        expect(git(kept, 'status', '--porcelain')).toBe('?? draft.md');
        expect(git(person, 'worktree', 'list', '--porcelain')).not.toContain('worktrees');
        expect(git(person, 'branch', '--list', 'haus/*')).toBe('haus/agt_bbbbbbbbbbbbbbbb/app');
    });

    test("retiring an Agent removes its clean worktrees and keeps each branch in the person's folder", async () => {
        const fixture = repos();
        const { dataRoot } = fixture;
        const folder = fixture.folder();
        const { path } = await checkoutAgentWorktree({
            agentId,
            dataRoot,
            folder,
            git: githubAppGit(dataRoot, serverId, { access: 'write', invocationId: 'inv_t' }),
            ref: null,
            repository: 'acme/app',
            sessionGeneration: 1,
            serverId,
        });

        await purgeRetiredAgent({ agentId, dataRoot, disk: null, serverId });

        expect(existsSync(path)).toBe(false);
        expect(git(folder, 'branch', '--list', 'haus/*')).toBe(`haus/${agentId}/app`);
    });
});
