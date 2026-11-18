import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openTurnLedger } from './turn-ledger.ts';

const roots: string[] = [];
afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

test('a relaunched run resumes its first start and settled totals until it reports', async () => {
    const agentRoot = await mkdtemp(join(tmpdir(), 'haus-turn-ledger-'));
    roots.push(agentRoot);
    const first = await openTurnLedger({
        agentRoot,
        now: () => new Date('2026-10-06T17:40:26.192Z'),
        runId: 'run_relaunch',
    });
    first.record({
        operations: [{ category: 'delegating', completed: 3, failed: 0, interrupted: 0 }],
    });
    await first.flush();
    // The Computer dies here: the first launch never reports or removes its ledger.

    const relaunch = await openTurnLedger({
        agentRoot,
        now: () => new Date('2026-10-06T17:41:39.000Z'),
        runId: 'run_relaunch',
    });
    expect(relaunch.startedAt).toBe('2026-10-06T17:40:26.192Z');
    expect(relaunch.seed).toEqual({
        operations: [{ category: 'delegating', completed: 3, failed: 0, interrupted: 0 }],
    });

    await relaunch.remove();
    expect(await readdir(join(agentRoot, 'runtime', 'turns'))).toEqual([]);
    const fresh = await openTurnLedger({
        agentRoot,
        now: () => new Date('2026-10-06T18:00:00.000Z'),
        runId: 'run_relaunch',
    });
    expect(fresh.startedAt).toBe('2026-10-06T18:00:00.000Z');
    expect(fresh.seed).toEqual({ operations: [] });
    await fresh.remove();
});

test('refuses a run id that could escape the ledger directory', async () => {
    await expect(
        openTurnLedger({ agentRoot: tmpdir(), now: () => new Date(), runId: '../escape' })
    ).rejects.toThrow(/run id is invalid/u);
});
