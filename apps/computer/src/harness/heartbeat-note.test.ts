import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { summarizeMemoryChange } from './dream-record.ts';
import {
    clearQuietRunNote,
    quietRunLine,
    readQuietRunNote,
    recordHeartbeatSettled,
} from './heartbeat-note.ts';

let root: string;
beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'haus-heartbeat-note-'));
});
afterEach(async () => {
    await rm(root, { force: true, recursive: true });
});

test('the quiet-run note counts settled heartbeats, renders one line, and clears', async () => {
    expect(await readQuietRunNote(root)).toBeNull();
    await recordHeartbeatSettled(root, {
        latestCheckpoint: 'heartbeat/checkpoints/a.md',
        reported: false,
    });
    await recordHeartbeatSettled(root, { latestCheckpoint: null, reported: true });
    const note = await readQuietRunNote(root);
    expect(note).toEqual({
        count: 2,
        dream: null,
        latestCheckpoint: 'heartbeat/checkpoints/a.md',
        reported: 1,
    });
    expect(note && quietRunLine(note)).toBe(
        'Your heartbeat ran 2× since your last turn (1 reported). Latest checkpoint: heartbeat/checkpoints/a.md.'
    );
    await clearQuietRunNote(root);
    expect(await readQuietRunNote(root)).toBeNull();
});

test('a nightly run that changed memory is named in the note, summed once per run', async () => {
    const dream = { added: 4, memory: true, notes: false, removed: 2 };
    await recordHeartbeatSettled(root, {
        latestCheckpoint: 'heartbeat/checkpoints/2026-10-21/17-00.md',
        reported: true,
        runId: 'run_day',
    });
    await recordHeartbeatSettled(root, {
        latestCheckpoint: null,
        reported: false,
        runId: 'run_day2',
    });
    const nightly = {
        dream,
        latestCheckpoint: 'heartbeat/daily/2026-10-22.md',
        reported: false,
        runId: 'run_night',
    };
    await recordHeartbeatSettled(root, nightly);
    await recordHeartbeatSettled(root, nightly);
    const note = await readQuietRunNote(root);
    expect(note).toMatchObject({ count: 3, dream, reported: 1 });
    expect(note && quietRunLine(note)).toBe(
        "Your heartbeat ran 3× since your last turn (1 reported). Last night's dream updated MEMORY.md (+4 −2): re-read it before relying on memory. Latest checkpoint: heartbeat/daily/2026-10-22.md."
    );
});

test('a dream that touched notes names them, and an old note without a dream still reads', async () => {
    expect(
        quietRunLine({
            count: 1,
            dream: { added: 1, memory: true, notes: true, removed: 0 },
            latestCheckpoint: null,
            reported: 0,
        })
    ).toBe(
        "Your heartbeat ran 1× since your last turn (0 reported). Last night's dream updated MEMORY.md and notes/ (+1 −0): re-read them before relying on memory. No checkpoint written."
    );
    await mkdir(join(root, 'runtime'), { recursive: true });
    await writeFile(
        join(root, 'runtime', 'heartbeat-note.json'),
        '{"count":2,"latestCheckpoint":null,"reported":0}\n'
    );
    expect(await readQuietRunNote(root)).toEqual({
        count: 2,
        dream: null,
        latestCheckpoint: null,
        reported: 0,
    });
});

test('a dream record summarizes changed memory files, and nothing for no change', () => {
    const file = { added: 3, change: 'modified' as const, path: 'MEMORY.md', removed: 1 };
    expect(summarizeMemoryChange([])).toBeNull();
    expect(
        summarizeMemoryChange([file, { ...file, added: 1, path: 'notes/shop.md', removed: 1 }])
    ).toEqual({ added: 4, memory: true, notes: true, removed: 2 });
});

test('a replayed heartbeat run is counted once, even after the note is cleared', async () => {
    const run = { latestCheckpoint: null, reported: true, runId: 'run_replayed' };
    await recordHeartbeatSettled(root, run);
    await recordHeartbeatSettled(root, run);
    expect(await readQuietRunNote(root)).toMatchObject({ count: 1, reported: 1 });
    await clearQuietRunNote(root);
    await recordHeartbeatSettled(root, run);
    expect(await readQuietRunNote(root)).toBeNull();
    await recordHeartbeatSettled(root, { ...run, runId: 'run_other' });
    expect(await readQuietRunNote(root)).toMatchObject({ count: 1 });
});
