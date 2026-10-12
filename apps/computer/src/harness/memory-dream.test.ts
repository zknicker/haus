import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import {
    checkDream,
    dreamCooldownMs,
    markDreamChecked,
    memorySizeLimitBytes,
    settleDreamBaseline,
} from './memory-dream.ts';

const runtime = makeDaemonRuntime();
const start = Date.parse('2026-10-11T03:00:00.000Z');
const dream = { createdAt: '2026-10-11T03:00:00.000Z', id: 'dream:agt_test:2026-10-11' };
let agentRoot: string;
let workspaceDir: string;

beforeEach(async () => {
    agentRoot = await mkdtemp(join(tmpdir(), 'haus-memory-dream-'));
    workspaceDir = join(agentRoot, 'workspace');
    await mkdir(join(workspaceDir, 'notes', 'research'), { recursive: true });
});

afterEach(async () => {
    await rm(agentRoot, { force: true, recursive: true });
});

afterAll(async () => {
    await runtime.dispose();
});

/** Each look is its own night here, so no check is `already-checked`. */
const due = async (now: number) =>
    (await checkDream({ agentRoot, localDate: `night-${now}`, now, workspaceDir })).verdict ===
    'due';
const settle = (now: number, withDream: unknown = dream) =>
    settleDreamBaseline({ agentRoot, dream: withDream, now, runtime, workspaceDir });

async function writeMemory(bytes: number): Promise<void> {
    await writeFile(join(workspaceDir, 'MEMORY.md'), 'x'.repeat(bytes));
}

test('the first look records a baseline, then a change anywhere in memory is due', async () => {
    await writeMemory(1024);
    expect(await due(start)).toBe(false);
    expect(await due(start + 1)).toBe(false);

    await writeFile(join(workspaceDir, 'notes', 'research', 'deep.md'), 'finding');
    expect(await due(start + 2)).toBe(true);
});

test('an mtime-only touch counts as a change without reading content', async () => {
    const note = join(workspaceDir, 'notes', 'billing.md');
    await writeFile(note, 'same');
    expect(await due(start)).toBe(false);
    await utimes(note, new Date(start), new Date(start));
    expect(await due(start + 1)).toBe(true);
});

test('an oversized MEMORY.md is due even on the first look', async () => {
    await writeMemory(memorySizeLimitBytes + 1);
    expect(await due(start)).toBe(true);
});

test('a completed dream re-baselines, so its own edits never make the next dream due', async () => {
    await writeMemory(1024);
    expect(await due(start)).toBe(false);
    await writeMemory(2048);
    expect(await due(start + 1)).toBe(true);

    // The dream turn rewrites memory, then settles.
    await writeMemory(512);
    await writeFile(join(workspaceDir, 'notes', 'topic.md'), 'moved detail');
    await settle(start + 2);

    // Inside the cooldown nothing is due, even after a change.
    await writeMemory(600);
    expect(await due(start + dreamCooldownMs - 1)).toBe(false);
    // After it, the day's change makes the next dream due.
    expect(await due(start + dreamCooldownMs + 2)).toBe(true);
});

test('an unchanged memory after a dream stays not due', async () => {
    await writeMemory(1024);
    await settle(start);
    expect(await due(start + dreamCooldownMs * 3)).toBe(false);
});

test('a turn that was not a dream never moves the baseline', async () => {
    await writeMemory(1024);
    expect(await due(start)).toBe(false);
    await writeMemory(2048);
    await settle(start + 1, null);
    expect(await due(start + 2)).toBe(true);
});

test('a failing baseline write logs instead of failing the completed turn', async () => {
    await writeMemory(1024);
    // The runtime directory is a file, so the stamp cannot be written.
    await writeFile(join(agentRoot, 'runtime'), 'not a directory');
    expect(await settle(start)).toBeUndefined();
});

test('a recorded night is already checked; a due night is recorded only once sent', async () => {
    const look = (localDate: string) =>
        checkDream({ agentRoot, localDate, now: start, workspaceDir });
    await writeMemory(1024);
    expect(await look('2026-10-11')).toEqual({ memoryBytes: 1024, verdict: 'baselined' });
    expect((await look('2026-10-11')).verdict).toBe('already-checked');

    await writeMemory(2048);
    expect((await look('2026-10-12')).verdict).toBe('due');
    // Unsent: the same night stays due.
    expect((await look('2026-10-12')).verdict).toBe('due');
    await markDreamChecked(agentRoot, '2026-10-12');
    expect((await look('2026-10-12')).verdict).toBe('already-checked');

    // A completed dream keeps the night it was checked on.
    await settle(start + 1);
    expect((await look('2026-10-12')).verdict).toBe('already-checked');
});
