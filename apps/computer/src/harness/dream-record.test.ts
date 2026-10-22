import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type AgentDreamRecord, agentDreamRecordSchema, dreamFilePatchLimitBytes } from '@haus/api';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { diffLines, formatHunks, splitLines } from './dream-diff.ts';
import { diffMemory, openDreamRecording, snapshotMemory } from './dream-record.ts';

const runtime = makeDaemonRuntime();
const dream = { kind: 'nightly' } as const;
let root: string;
let workspaceDir: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'haus-dream-record-'));
    workspaceDir = join(root, 'workspace');
    await mkdir(join(workspaceDir, 'notes', 'research'), { recursive: true });
});

afterEach(async () => {
    await rm(root, { force: true, recursive: true });
});

afterAll(async () => {
    await runtime.dispose();
});

const memory = [
    '# Memory',
    '',
    '## Role',
    'Ads operator.',
    '',
    '## Active Context',
    '- Waiting on the Q4 budget.',
    '- Creative refresh due Oct 20.',
    '',
    '## Key Knowledge',
    '- notes/prime-day.md: Prime Day recap',
    '',
].join('\n');

test('a dream run reports its memory changes as stats and one sectioned unified diff', async () => {
    await writeFile(join(workspaceDir, 'MEMORY.md'), memory);
    await writeFile(join(workspaceDir, 'notes', 'old.md'), 'stale\n');
    await writeFile(join(workspaceDir, 'outside.md'), 'not memory\n');
    const frames: AgentDreamRecord[] = [];
    const recording = await openDreamRecording({
        command: { agentId: 'agt_test', heartbeat: dream, runId: 'run_dream' },
        runtime,
        sendFrame: (frame) => frames.push(frame),
        startedAt: '2026-10-11T03:00:00.000Z',
        workspaceDir,
    });

    await writeFile(
        join(workspaceDir, 'MEMORY.md'),
        memory.replace('- Waiting on the Q4 budget.', '- Q4 budget approved: $18k.')
    );
    await unlink(join(workspaceDir, 'notes', 'old.md'));
    await writeFile(
        join(workspaceDir, 'notes', 'research', 'ramp.md'),
        '# Ramp\nStep up Oct 14.\n'
    );
    await writeFile(join(workspaceDir, 'outside.md'), 'changed, still not memory\n');
    const change = await recording?.finish();

    expect(change).toEqual({ added: 3, memory: true, notes: true, removed: 2 });
    expect(frames).toHaveLength(1);
    const frame = agentDreamRecordSchema.parse(frames[0]);
    expect(frame).toMatchObject({ agentId: 'agt_test', runId: 'run_dream' });
    expect(frame.files).toEqual([
        { added: 1, change: 'modified', path: 'MEMORY.md', removed: 1 },
        { added: 0, change: 'deleted', path: 'notes/old.md', removed: 1 },
        { added: 2, change: 'added', path: 'notes/research/ramp.md', removed: 0 },
    ]);
    expect(frame.patch).toContain(
        'diff --git a/MEMORY.md b/MEMORY.md\n--- a/MEMORY.md\n+++ b/MEMORY.md\n'
    );
    expect(frame.patch).toContain(
        '@@ -4,7 +4,7 @@ ## Role\n Ads operator.\n \n ## Active Context\n'
    );
    expect(frame.patch).toContain('-- Waiting on the Q4 budget.\n+- Q4 budget approved: $18k.\n');
    expect(frame.patch).toContain('--- a/notes/old.md\n+++ /dev/null\n@@ -1,1 +0,0 @@\n-stale\n');
    expect(frame.patch).toContain(
        '--- /dev/null\n+++ b/notes/research/ramp.md\n@@ -0,0 +1,2 @@\n+# Ramp\n'
    );
    expect(frame.patch).not.toContain('outside.md');
});

test('a dream that changed nothing still reports, with no files', async () => {
    await writeFile(join(workspaceDir, 'MEMORY.md'), memory);
    const frames: AgentDreamRecord[] = [];
    const recording = await openDreamRecording({
        command: { agentId: 'agt_test', heartbeat: dream, runId: 'run_quiet' },
        runtime,
        sendFrame: (frame) => frames.push(frame),
        startedAt: '2026-10-11T03:00:00.000Z',
        workspaceDir,
    });
    expect(await recording?.finish()).toBeNull();

    expect(frames).toEqual([expect.objectContaining({ files: [], patch: '' })]);
});

test('an ordinary run records nothing', async () => {
    const recording = await openDreamRecording({
        command: { agentId: 'agt_test', runId: 'run_chat' },
        runtime,
        sendFrame: () => undefined,
        startedAt: '2026-10-11T03:00:00.000Z',
        workspaceDir,
    });
    expect(recording).toBeNull();
});

test('a daytime heartbeat records no dream', async () => {
    const recording = await openDreamRecording({
        command: { agentId: 'agt_test', heartbeat: { kind: 'daytime' }, runId: 'run_day' },
        runtime,
        sendFrame: () => undefined,
        startedAt: '2026-10-11T10:00:00.000Z',
        workspaceDir,
    });
    expect(recording).toBeNull();
});

test('binary and over-cap files keep counts with a marker and no text', async () => {
    const big = Array.from({ length: 4000 }, (_, index) => `line ${index} ${'x'.repeat(20)}`);
    await writeFile(join(workspaceDir, 'notes', 'big.md'), `${big.join('\n')}\n`);
    await writeFile(join(workspaceDir, 'notes', 'image.png'), Buffer.from([0x89, 0x50, 0, 1]));
    await symlink(join(workspaceDir, 'notes', 'big.md'), join(workspaceDir, 'notes', 'link.md'));
    const before = await snapshotMemory(workspaceDir);
    expect([...before.entries.keys()]).toEqual(['notes/big.md', 'notes/image.png']);

    await writeFile(
        join(workspaceDir, 'notes', 'big.md'),
        `${big.map((line) => `${line}!`).join('\n')}\n`
    );
    await writeFile(join(workspaceDir, 'notes', 'image.png'), Buffer.from([0x89, 0x50, 0, 2]));
    const { files, patch } = diffMemory(before, await snapshotMemory(workspaceDir));

    expect(files).toEqual([
        {
            added: 4000,
            change: 'modified',
            omitted: 'too-large',
            path: 'notes/big.md',
            removed: 4000,
        },
        { added: 0, change: 'modified', omitted: 'binary', path: 'notes/image.png', removed: 0 },
    ]);
    expect(patch).toBe('');
    expect(dreamFilePatchLimitBytes).toBe(64 * 1024);
});

test('past the text budget files are only digested, and an unchanged one is not reported', async () => {
    const limits = { fileCount: 10, textBytes: 12 };
    await writeFile(join(workspaceDir, 'notes', 'a.md'), 'first note\n');
    await writeFile(join(workspaceDir, 'notes', 'b.md'), 'second note\n');
    await writeFile(join(workspaceDir, 'notes', 'c.md'), 'third note\n');
    const before = await snapshotMemory(workspaceDir, limits);
    expect([...before.entries.values()].map((entry) => entry.kind)).toEqual([
        'text',
        'opaque',
        'opaque',
    ]);

    // a.md grows past the budget and becomes opaque; c.md changes while opaque.
    await writeFile(join(workspaceDir, 'notes', 'a.md'), 'first note, now much longer\n');
    await writeFile(join(workspaceDir, 'notes', 'c.md'), 'third note, edited\n');
    const { files, truncated } = diffMemory(before, await snapshotMemory(workspaceDir, limits));

    expect(truncated).toBe(false);
    expect(files).toEqual([
        { added: 0, change: 'modified', omitted: 'too-large', path: 'notes/a.md', removed: 0 },
        { added: 0, change: 'modified', omitted: 'too-large', path: 'notes/c.md', removed: 0 },
    ]);
});

test('past the file cap nothing is compared and the record says truncated', async () => {
    const limits = { fileCount: 2, textBytes: 1024 };
    await writeFile(join(workspaceDir, 'MEMORY.md'), memory);
    await writeFile(join(workspaceDir, 'notes', 'a.md'), 'a\n');
    const before = await snapshotMemory(workspaceDir, limits);
    expect(before.truncated).toBe(false);

    await writeFile(join(workspaceDir, 'notes', 'b.md'), 'b\n');
    const after = await snapshotMemory(workspaceDir, limits);
    expect(after).toEqual({ entries: new Map(), truncated: true });
    const record = diffMemory(before, after);
    expect(record).toEqual({ files: [], patch: '', truncated: true });
    expect(
        agentDreamRecordSchema.safeParse({
            ...record,
            agentId: 'agt_test',
            finishedAt: '2026-10-11T03:05:00.000Z',
            runId: 'run_dream',
            startedAt: '2026-10-11T03:00:00.000Z',
            type: 'agent-dream-record',
        }).success
    ).toBe(true);
});

test('the line diff is minimal and its hunks merge nearby changes', () => {
    const before = splitLines('a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\nm\nn\n');
    const after = splitLines('a\nB\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\nM\nn\nadded\n');
    const ops = diffLines(before, after);
    expect(ops.filter((op) => op.kind !== ' ')).toEqual([
        { kind: '-', text: 'b' },
        { kind: '+', text: 'B' },
        { kind: '-', text: 'm' },
        { kind: '+', text: 'M' },
        { kind: '+', text: 'added' },
    ]);
    const hunks = formatHunks(ops, before, after).filter((line) => line.startsWith('@@'));
    // b→B and m→M sit nine lines apart, past twice the context: two hunks.
    expect(hunks).toEqual(['@@ -1,5 +1,5 @@', '@@ -10,5 +10,6 @@']);
});
