import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agentSessions } from './agent-sessions.ts';

let dataDir: string;
afterEach(async () => {
    await rm(dataDir, { force: true, recursive: true });
});

test('a run applies the full reset the runner missed, and runs a reset, restart or retire replaced are refused', async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'haus-runner-sessions-'));
    const agentDir = (agentId: string) => join(dataDir, 'agents', agentId);
    const sessions = agentSessions({ agentDir, dataDir, release: () => undefined });
    const run = (sessionGeneration: number, sessionResetKind: 'full' | 'session') => ({
        sessionResetKind,
        start: { agentId: 'agt_alpha', sessionGeneration },
    });
    await mkdir(join(agentDir('agt_alpha'), 'claude'), { recursive: true });

    expect(await sessions.enter(run(1, 'session'), 0)).toBe(true);
    expect(await sessions.enter(run(2, 'session'), 0)).toBe(true);
    expect(await readdir(agentDir('agt_alpha'))).toEqual(['claude']);

    expect(await sessions.enter(run(4, 'full'), 0)).toBe(true);
    expect(await readdir(join(dataDir, 'agents'))).toEqual([]);
    expect(await sessions.enter(run(4, 'full'), 0)).toBe(true);
    expect(await sessions.enter(run(3, 'session'), 0)).toBe(false);

    sessions.announce('agt_alpha', { scope: 'session', sessionGeneration: 6 });
    expect(await sessions.enter(run(5, 'session'), 0)).toBe(false);
    expect(await sessions.enter(run(4, 'full'), 0)).toBe(false);
    expect(sessions.supersedes({ scope: 'session', sessionGeneration: 6 }, 5)).toBe(true);
    expect(sessions.supersedes({ scope: 'session', sessionGeneration: 6 }, 6)).toBe(false);
    expect(sessions.supersedes({ scope: 'restart' }, 6)).toBe(true);
    expect(sessions.supersedes({ scope: 'retire' }, 6)).toBe(true);

    const queuedBeforeRestart = sessions.restartEpoch('agt_alpha');
    sessions.announce('agt_alpha', { scope: 'restart' });
    expect(await sessions.enter(run(6, 'session'), queuedBeforeRestart)).toBe(false);
    expect(await sessions.enter(run(6, 'session'), sessions.restartEpoch('agt_alpha'))).toBe(true);

    sessions.announce('agt_alpha', { scope: 'retire' });
    expect(await sessions.enter(run(6, 'session'), 0)).toBe(false);
});

test('an archive frees the session without retiring it: a stale run is refused, a newer one runs', async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'haus-runner-sessions-'));
    const agentDir = (agentId: string) => join(dataDir, 'agents', agentId);
    const released: string[] = [];
    const sessions = agentSessions({
        agentDir,
        dataDir,
        release: (agentId) => released.push(agentId),
    });
    const run = (sessionGeneration: number) => ({
        sessionResetKind: 'full' as const,
        start: { agentId: 'agt_task', sessionGeneration },
    });
    expect(await sessions.enter(run(1), 0)).toBe(true);
    await mkdir(join(agentDir('agt_task'), 'claude'), { recursive: true });

    const archive = { scope: 'archive', sessionGeneration: 2 } as const;
    expect(sessions.supersedes(archive, 1)).toBe(true);
    sessions.announce('agt_task', archive);
    await sessions.apply('agt_task', archive);

    expect(released).toEqual(['agt_task']);
    expect(await readdir(join(dataDir, 'agents'))).toEqual([]);
    expect(await sessions.enter(run(1), 0)).toBe(false);
    expect(await sessions.enter(run(3), 0)).toBe(true);
});
