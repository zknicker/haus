import { expect, test } from 'bun:test';
import { unzipSync } from 'fflate';
import { artifactDriveFixture } from './artifact-drive-fixture.ts';
import { createHausClient } from './haus-client.ts';

/**
 * `artifact.zip` plans a selection and issues a short-lived link; `GET /artifacts/zip/:token`
 * streams it as a STORE archive named relative to the selection root.
 */
const { publish, state, storage } = artifactDriveFixture('artifact-zip');
const bytes = (seed: number, length: number) =>
    Uint8Array.from({ length }, (_, index) => (index * 31 + seed) % 251);

test('a folder zips with its structure and byte-identical, stored members', async () => {
    const a = bytes(1, 70_000);
    const b = bytes(2, 1234);
    await publish({ body: a, contentType: 'image/png', path: 'zip/print-ready/a.png' });
    await publish({ body: b, contentType: 'image/png', path: 'zip/print-ready/nested/b.png' });
    await publish({ path: 'zip/candidates/c.png' });
    const link = await zip('zip', ['zip/print-ready']);
    expect(link).toMatchObject({ file_count: 2, filename: 'print-ready.zip', total_bytes: 71_234 });
    const response = await fetch(new URL(link.zip_path, state.harness.url));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');
    expect(response.headers.get('content-disposition')).toContain('filename="print-ready.zip"');
    const archive = new Uint8Array(await response.arrayBuffer());
    const members = unzipSync(archive);
    expect(Object.keys(members).sort()).toEqual(['print-ready/a.png', 'print-ready/nested/b.png']);
    expect(members['print-ready/a.png']).toEqual(a);
    expect(members['print-ready/nested/b.png']).toEqual(b);
    expect(compressionMethods(archive)).toEqual([0, 0]);
});

test('a selection zips relative to its root, and the link survives a retry', async () => {
    await publish({ body: 'one', path: 'zip/pick/one.png' });
    await publish({ body: 'two', path: 'zip/pick/two.png' });
    await publish({ body: 'three', path: 'zip/pick/three.png' });
    const link = await zip('zip/pick', ['zip/pick/one.png', 'zip/pick/three.png']);
    expect(link).toMatchObject({ file_count: 2, filename: 'pick.zip' });
    for (const _attempt of [1, 2]) {
        const response = await fetch(new URL(link.zip_path, state.harness.url));
        const members = unzipSync(new Uint8Array(await response.arrayBuffer()));
        expect(Object.keys(members).sort()).toEqual(['one.png', 'three.png']);
        expect(new TextDecoder().decode(members['three.png'])).toBe('three');
    }
});

test('zips refuse oversize selections, paths outside the root, and outsiders', async () => {
    // Sixteen files at the 256 MiB per-file limit pass the 4 GB zip cap.
    for (const index of Array.from({ length: 16 }, (_, at) => at)) {
        const huge = await publish({ path: `zip/huge/print-${index}.png` });
        await state.harness.sql`
            update artifact_revisions set byte_size = 268435456
            where id = ${huge.artifact.revision_id}
        `;
    }
    await expect(zip('zip', ['zip/huge'])).rejects.toMatchObject({
        data: { artifact: { code: 'SIZE_LIMIT' }, code: 'PAYLOAD_TOO_LARGE' },
        message: expect.stringContaining('at most 4.0 GB'),
    });
    await expect(zip('zip/pick', ['zip/huge/print-0.png'])).rejects.toMatchObject({
        data: { code: 'BAD_REQUEST' },
    });
    const outsider = createHausClient(
        state.harness,
        await state.harness.humans.mintSessionToken('artifact-zip_outsider')
    );
    await expect(
        outsider.trpc.artifact.zip.mutate({
            paths: ['zip/pick'],
            root: 'zip',
            serverId: state.serverId,
        })
    ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
    outsider.close();
    for (const token of ['missing', 'A'.repeat(32)]) {
        const response = await fetch(new URL(`/artifacts/zip/${token}`, state.harness.url));
        expect(response.status).toBe(404);
        expect(await response.text()).toContain('expired');
    }
});

test('HEAD answers the headers without reading storage', async () => {
    await publish({ path: 'zip/head/one.png' });
    const link = await zip('zip', ['zip/head']);
    const original = storage.stream.bind(storage);
    let reads = 0;
    storage.stream = (key: string) => {
        reads += 1;
        return original(key);
    };
    try {
        const response = await fetch(new URL(link.zip_path, state.harness.url), { method: 'HEAD' });
        expect(response.status).toBe(200);
        expect(response.headers.get('content-disposition')).toContain('filename="head.zip"');
        expect(reads).toBe(0);
    } finally {
        storage.stream = original;
    }
});

test('a cancelled download stops reading storage', async () => {
    const slow = await publish({ path: 'zip/slow/endless.png' });
    const original = storage.stream.bind(storage);
    let cancelled = false;
    let key = '';
    const [row] = await state.harness.sql`
        select object_key from artifact_revisions where id = ${slow.artifact.revision_id}
    `;
    key = row.object_key as string;
    storage.stream = (objectKey: string) =>
        objectKey === key
            ? new ReadableStream<Uint8Array>({
                  cancel: () => {
                      cancelled = true;
                  },
                  pull: async (controller) => {
                      await Bun.sleep(5);
                      controller.enqueue(new Uint8Array(64 * 1024));
                  },
              })
            : original(objectKey);
    try {
        const link = await zip('zip/slow', ['zip/slow/endless.png']);
        const abort = new AbortController();
        const response = await fetch(new URL(link.zip_path, state.harness.url), {
            signal: abort.signal,
        });
        const reader = response.body?.getReader();
        await reader?.read();
        abort.abort();
        await Bun.sleep(200);
        expect(cancelled).toBe(true);
    } finally {
        storage.stream = original;
    }
});

function zip(root: string, paths: string[]) {
    return state.owner.trpc.artifact.zip.mutate({ paths, root, serverId: state.serverId });
}

/** The compression method of every local file header (0 is STORE). */
function compressionMethods(archive: Uint8Array): number[] {
    const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
    const methods: number[] = [];
    let offset = 0;
    while (offset + 30 <= archive.length && view.getUint32(offset, true) === 0x04_03_4b_50) {
        methods.push(view.getUint16(offset + 8, true));
        const nameLength = view.getUint16(offset + 26, true);
        const extraLength = view.getUint16(offset + 28, true);
        const flags = view.getUint16(offset + 6, true);
        const start = offset + 30 + nameLength + extraLength;
        // Streamed members carry their sizes in the central directory; find this one's there.
        const size =
            flags & 8 ? centralSize(view, methods.length - 1) : view.getUint32(offset + 18, true);
        offset = start + size + (flags & 8 ? 16 : 0);
    }
    return methods;
}

function centralSize(view: DataView, index: number): number {
    const end = view.byteLength - 22;
    let offset = view.getUint32(end + 16, true);
    for (let entry = 0; entry < index; entry += 1) {
        offset +=
            46 +
            view.getUint16(offset + 28, true) +
            view.getUint16(offset + 30, true) +
            view.getUint16(offset + 32, true);
    }
    return view.getUint32(offset + 20, true);
}
