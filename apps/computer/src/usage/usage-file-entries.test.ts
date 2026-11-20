import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RecentUsageFile } from './local-runtime-usage.ts';
import { createUsageEntryReader } from './usage-file-entries.ts';

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

const usageIds = (rows: unknown[]) =>
    rows.map((row) => (row as { usage: { id: string } }).usage.id);

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
    const read = createUsageEntryReader(usageIds);

    expect(await read([await recent(path)])).toEqual(['first', 'straddles', 'crlf', 'last']);
});

test('keeps entries for an unchanged file and rereads one that changed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-usage-entries-'));
    roots.push(root);
    const path = join(root, 'session.jsonl');
    await writeFile(path, JSON.stringify({ usage: { id: 'one' } }));
    const read = createUsageEntryReader(usageIds);
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
    const read = createUsageEntryReader(usageIds);

    expect(await read([{ mtimeMs: 1, path: join(root, 'gone.jsonl'), size: 1 }])).toEqual([]);
});

async function recent(path: string) {
    const info = await stat(path);
    return { mtimeMs: info.mtimeMs, path, size: info.size } satisfies RecentUsageFile;
}
