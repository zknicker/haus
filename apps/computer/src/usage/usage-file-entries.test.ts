import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RecentUsageFile } from './local-runtime-usage.ts';
import { createUsageEntryReader, usageLineLimitChars } from './usage-file-entries.ts';

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

const usageEntries = (rows: unknown[]) =>
    rows.map((row) => {
        const { usage } = row as { usage: { at?: number; id: string } };
        return { id: usage.id, timestampMs: usage.at ?? 0 };
    });

const reader = () => {
    const read = createUsageEntryReader(usageEntries);
    return async (files: RecentUsageFile[], cutoffMs = 0) =>
        (await read(files, cutoffMs)).map((entry) => entry.id);
};

test('reads usage rows line by line, across stream chunks, skipping every other line', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-usage-entries-'));
    roots.push(root);
    const path = join(root, 'session.jsonl');
    const filler = JSON.stringify({ text: 'x'.repeat(700_000) });
    await writeFile(
        path,
        [
            JSON.stringify({ usage: { id: 'first' } }),
            filler,
            JSON.stringify({ text: 'y'.repeat(400_000), usage: { id: 'straddles' } }),
            '{"usage": broken',
            filler,
            `${JSON.stringify({ usage: { id: 'crlf' } })}\r`,
            JSON.stringify({ usage: { id: 'last' } }),
        ].join('\n')
    );
    const read = reader();

    expect(await read([await recent(path)])).toEqual(['first', 'straddles', 'crlf', 'last']);
});

test('keeps entries for an unchanged file and rereads one that changed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-usage-entries-'));
    roots.push(root);
    const path = join(root, 'session.jsonl');
    await writeFile(path, JSON.stringify({ usage: { id: 'one' } }));
    const read = reader();
    const first = await recent(path);
    expect(await read([first])).toEqual(['one']);

    await writeFile(
        path,
        `${JSON.stringify({ usage: { id: 'one' } })}\n${JSON.stringify({ usage: { id: 'two' } })}`
    );
    expect(await read([first])).toEqual(['one']);
    expect(await read([await recent(path)])).toEqual(['one', 'two']);
});

test('a transcript that disappears between scan and read counts as empty', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-usage-entries-'));
    roots.push(root);
    const read = reader();

    expect(await read([{ mtimeMs: 1, path: join(root, 'gone.jsonl'), size: 1 }])).toEqual([]);
});

test('a line past the limit is skipped without stopping the lines after it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-usage-entries-'));
    roots.push(root);
    const path = join(root, 'session.jsonl');
    const oversized = JSON.stringify({
        text: 'z'.repeat(usageLineLimitChars),
        usage: { id: 'huge' },
    });
    await writeFile(
        path,
        [
            JSON.stringify({ usage: { id: 'before' } }),
            oversized,
            JSON.stringify({ usage: { id: 'after' } }),
            oversized,
        ].join('\n')
    );

    expect(await reader()([await recent(path)])).toEqual(['before', 'after']);
});

test('entries older than the cutoff leave the cache, even for an unchanged file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-usage-entries-'));
    roots.push(root);
    const path = join(root, 'session.jsonl');
    await writeFile(
        path,
        [10, 20, 30].map((at) => JSON.stringify({ usage: { at, id: `at-${at}` } })).join('\n')
    );
    const read = reader();
    const file = await recent(path);

    expect(await read([file], 15)).toEqual(['at-20', 'at-30']);
    expect(await read([file], 25)).toEqual(['at-30']);
    expect(await read([file], 0)).toEqual(['at-30']);
});

async function recent(path: string) {
    const info = await stat(path);
    return { mtimeMs: info.mtimeMs, path, size: info.size } satisfies RecentUsageFile;
}
