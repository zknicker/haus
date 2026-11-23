import { expect, test } from 'bun:test';
import { mkdir, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import type { InvocationOperation, InvokeResult } from '@haus/api';
import { registerRepoFixture } from '../repos/repo.fixture.ts';
import { lastUseMs, worktreeGitDirs } from '../repos/worktree-marker.ts';
import { handlerInput } from './handler-host.test-support.ts';
import { createInvocationHandler } from './handler.ts';

const repos = registerRepoFixture();

test('a repo-checkout invocation makes the worktree, and a file read inside it counts as a use', async () => {
    const fixture = repos();
    const folder = fixture.folder();
    const agentsRoot = join(fixture.dataRoot, 'servers', 'srv_1', 'agents');
    await mkdir(agentsRoot, { recursive: true });
    const frames: unknown[] = [];
    const handler = await createInvocationHandler(handlerInput(agentsRoot, frames));
    const path = join(
        fixture.dataRoot,
        'servers',
        'srv_1',
        'worktrees',
        'agt_alpha',
        'acme',
        'app'
    );
    const run = async (invocationId: string, operation: InvocationOperation) => {
        handler.receive({
            agentId: 'agt_alpha',
            invocationId,
            operation,
            runId: 'run-1',
            timeoutMs: 30_000,
            type: 'invoke',
        });
        await handler.settled();
        return frames.find(
            (frame): frame is InvokeResult =>
                (frame as InvokeResult).type === 'invoke-result' &&
                (frame as InvokeResult).invocationId === invocationId
        );
    };

    const made = await run('inv-1', {
        folder,
        kind: 'repo-checkout',
        ref: null,
        repository: 'acme/app',
    });
    const unfoldered = await run('inv-2', {
        kind: 'repo-checkout',
        ref: null,
        repository: 'acme/app',
    });
    const admin = (await worktreeGitDirs(path))?.admin ?? '';
    const old = new Date(Date.now() - 86_400_000);
    for (const file of ['haus-worktree.json', 'index']) {
        await utimes(join(admin, file), old, old);
    }
    await run('inv-3', { kind: 'file-read', maxBytes: 1000, path: join(path, '.git') });

    expect(made?.outcome).toBe('completed');
    expect(made?.output).toEqual({
        kind: 'text',
        text: expect.stringContaining(`Made the worktree ${path} on haus/agt_alpha/app`),
    });
    expect(unfoldered?.outcome).toBe('failed');
    expect(unfoldered?.output).toEqual({
        kind: 'text',
        text: 'This Computer has no folder for acme/app. Ask the person who attached it to add one.',
    });
    expect((await lastUseMs(path)) ?? 0).toBeGreaterThan(Date.now() - 60_000);
});
