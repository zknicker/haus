import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agentSessions } from './agent-sessions.ts';

let dataDir: string;
afterEach(async () => {
    await rm(dataDir, { force: true, recursive: true });
});

test('a run applies the full reset the runner missed, and runs a reset or retire replaced are refused', async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'haus-runner-sessions-'));
    const agentDir = (agentId: string) => join(dataDir, 'agents', agentId);
    const sessions = agentSessions({ agentDir, dataDir, release: () => undefined });
    const run = (sessionGeneration: number, sessionResetKind: 'full' | 'session') => ({
        sessionResetKind,
        start: { agentId: 'agt_alpha', sessionGeneration },
    });
    await mkdir(join(agentDir('agt_alpha'), 'claude'), { recursive: true });

    expect(await sessions.enter(run(1, 'session'))).toBe(true);
    expect(await sessions.enter(run(2, 'session'))).toBe(true);
    expect(await readdir(agentDir('agt_alpha'))).toEqual(['claude']);

    expect(await sessions.enter(run(4, 'full'))).toBe(true);
    expect(await readdir(join(dataDir, 'agents'))).toEqual([]);
    expect(await sessions.enter(run(4, 'full'))).toBe(true);
    expect(await sessions.enter(run(3, 'session'))).toBe(false);

    sessions.announce('agt_alpha', { scope: 'session', sessionGeneration: 6 });
    expect(await sessions.enter(run(5, 'session'))).toBe(false);
    expect(await sessions.enter(run(4, 'full'))).toBe(false);
    expect(sessions.supersedes({ scope: 'session', sessionGeneration: 6 }, 5)).toBe(true);
    expect(sessions.supersedes({ scope: 'session', sessionGeneration: 6 }, 6)).toBe(false);
    expect(sessions.supersedes({ scope: 'restart' }, 6)).toBe(true);
    expect(sessions.supersedes({ scope: 'retire' }, 6)).toBe(true);

    sessions.announce('agt_alpha', { scope: 'retire' });
    expect(await sessions.enter(run(6, 'session'))).toBe(false);
});
