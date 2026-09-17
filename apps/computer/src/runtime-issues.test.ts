import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRuntimeIssues, recordRuntimeOutcome } from './runtime-issues.ts';

const roots: string[] = [];
afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
test('runtime auth issues persist, isolate runtimes, and clear only on later success', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-runtime-issues-'));
    roots.push(dataRoot);
    const base = { dataRoot, runtimeId: 'grok-build', startedAt: '2026-09-17T17:00:00.000Z' };
    expect(await readRuntimeIssues(dataRoot)).toEqual([]);
    await recordRuntimeOutcome({ ...base, status: 'failed', failureKind: 'authentication' });
    await recordRuntimeOutcome({ ...base, runtimeId: 'codex', status: 'completed' });
    await recordRuntimeOutcome({ ...base, status: 'interrupted' });
    await recordRuntimeOutcome({ ...base, status: 'failed', failureKind: 'transport' });
    await recordRuntimeOutcome({
        ...base,
        startedAt: '2026-09-17T16:00:00.000Z',
        status: 'completed',
    });
    expect(await readRuntimeIssues(dataRoot)).toEqual([
        { runtimeId: 'grok-build', kind: 'authentication', observedAt: base.startedAt },
    ]);
    await recordRuntimeOutcome({
        ...base,
        startedAt: '2026-09-17T18:00:00.000Z',
        status: 'completed',
    });
    expect(await readRuntimeIssues(dataRoot)).toEqual([]);
    await recordRuntimeOutcome({ ...base, status: 'failed', failureKind: 'authentication' });
    expect(await readRuntimeIssues(dataRoot)).toEqual([]);
});
