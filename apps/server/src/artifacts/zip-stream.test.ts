import { expect, test } from 'bun:test';
import { unzipSync } from 'fflate';
import type { ArtifactStorage } from './storage.ts';
import { streamArtifactZip } from './zip-stream.ts';
import { createZipTickets } from './zip-tickets.ts';

const modifiedAt = new Date('2026-10-01T12:00:00Z');

test('streams stored members in order and keeps their bytes', async () => {
    const objects = new Map([
        ['k1', new TextEncoder().encode('first')],
        ['k2', new Uint8Array(100_000).fill(7)],
    ]);
    const archive = await new Response(
        streamArtifactZip(storageOf(objects), [
            { modifiedAt, name: 'a/first.txt', objectKey: 'k1', size: 5 },
            { modifiedAt, name: 'b.png', objectKey: 'k2', size: 100_000 },
        ])
    ).bytes();
    const members = unzipSync(archive);
    expect(Object.keys(members)).toEqual(['a/first.txt', 'b.png']);
    expect(new TextDecoder().decode(members['a/first.txt'])).toBe('first');
    expect(members['b.png']).toEqual(new Uint8Array(100_000).fill(7));
});

test('a member whose stored size changed errors the stream', async () => {
    const objects = new Map([['k1', new TextEncoder().encode('short')]]);
    const pending = new Response(
        streamArtifactZip(storageOf(objects), [
            { modifiedAt, name: 'a.txt', objectKey: 'k1', size: 99 },
        ])
    ).bytes();
    await expect(pending).rejects.toThrow('expected 99');
});

test('cancelling the archive cancels the open storage read', async () => {
    let cancelled = false;
    const storage = storageOf(new Map());
    storage.stream = () =>
        new ReadableStream<Uint8Array>({
            cancel: () => {
                cancelled = true;
            },
            pull: (controller) => controller.enqueue(new Uint8Array(1024)),
        });
    const reader = streamArtifactZip(storage, [
        { modifiedAt, name: 'endless.bin', objectKey: 'k', size: 1 },
    ]).getReader();
    await reader.read();
    await reader.read();
    await reader.cancel('gone');
    expect(cancelled).toBe(true);
});

test('zip links expire', () => {
    let now = 1000;
    const tickets = createZipTickets(() => now);
    const actor = { kind: 'human', member: null, serverId: 'srv' } as const;
    const { token } = tickets.issue(actor, { paths: ['a'], root: '' });
    expect(tickets.read(token)?.selection).toEqual({ paths: ['a'], root: '' });
    expect(tickets.read('not-a-token')).toBeNull();
    now += 300_000;
    expect(tickets.read(token)).toBeNull();
});

function storageOf(objects: Map<string, Uint8Array>): ArtifactStorage {
    return {
        delete: () => Promise.resolve(),
        downloadUrl: (key) => key,
        read: (key) => Promise.resolve(objects.get(key) ?? new Uint8Array()),
        stream: (key) => new Blob([Uint8Array.from(objects.get(key) ?? [])]).stream(),
        upload: () => Promise.reject(new Error('read-only')),
    };
}
