import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { createR2ArtifactStorage } from './storage.ts';

test('R2 adapter streams exact binary bytes, hashes them, and issues only signed private downloads', async () => {
    const parts: Uint8Array[] = [];
    const server = Bun.serve({
        port: 0,
        fetch: async (request) => {
            const url = new URL(request.url);
            if (request.method === 'POST' && url.searchParams.has('uploads')) {
                return xml(
                    '<InitiateMultipartUploadResult><Bucket>test</Bucket><Key>binary</Key><UploadId>test-upload</UploadId></InitiateMultipartUploadResult>'
                );
            }
            if (request.method === 'PUT') {
                parts.push(new Uint8Array(await request.arrayBuffer()));
                return new Response('', { headers: { etag: '"part-etag"' } });
            }
            if (request.method === 'POST') {
                return xml(
                    '<CompleteMultipartUploadResult><Location>test</Location><Bucket>test</Bucket><Key>binary</Key><ETag>"complete-etag"</ETag></CompleteMultipartUploadResult>'
                );
            }
            return new Response('', { status: 204 });
        },
    });
    try {
        const storage = createR2ArtifactStorage({
            accessKeyId: 'test-access',
            bucket: 'test',
            endpoint: server.url.href,
            secretAccessKey: 'test-secret',
        });
        const bytes = Uint8Array.of(0, 255, 128, 13, 10);
        const result = await storage.upload('binary', chunks(bytes), 'application/octet-stream');
        expect(Buffer.concat(parts)).toEqual(Buffer.from(bytes));
        expect(result).toEqual({
            sha256: createHash('sha256').update(bytes).digest('hex'),
            size: 5,
        });
        const signed = new URL(storage.downloadUrl('binary'));
        expect(signed.searchParams.get('X-Amz-Expires')).toBe('300');
        expect(signed.searchParams.has('X-Amz-Signature')).toBe(true);
        expect(signed.searchParams.has('response-content-disposition')).toBe(false);
        const saved = new URL(storage.downloadUrl('binary', 'Q3 report.pdf'));
        expect(saved.searchParams.get('response-content-disposition')).toBe(
            `attachment; filename="Q3 report.pdf"; filename*=UTF-8''Q3%20report.pdf`
        );
    } finally {
        await server.stop(true);
    }
});

test('R2 adapter refuses streamed overflow before completing publication', async () => {
    const server = Bun.serve({
        port: 0,
        fetch: () =>
            xml(
                '<InitiateMultipartUploadResult><Bucket>test</Bucket><Key>binary</Key><UploadId>test-upload</UploadId></InitiateMultipartUploadResult>'
            ),
    });
    try {
        const storage = createR2ArtifactStorage({
            accessKeyId: 'test-access',
            bucket: 'test',
            endpoint: server.url.href,
            maxBytes: 4,
            secretAccessKey: 'test-secret',
        });
        await expect(
            storage.upload(
                'binary',
                chunks(Uint8Array.of(0, 1, 2, 3, 4)),
                'application/octet-stream'
            )
        ).rejects.toThrow();
    } finally {
        await server.stop(true);
    }
});
test('R2 adapter reads a bounded prefix with one ranged GET', async () => {
    const ranges: (string | null)[] = [];
    const server = Bun.serve({
        port: 0,
        fetch: (request) => {
            ranges.push(request.headers.get('range'));
            return new Response('hello', { status: 206 });
        },
    });
    try {
        const storage = createR2ArtifactStorage({
            accessKeyId: 'test-access',
            bucket: 'test',
            endpoint: server.url.href,
            secretAccessKey: 'test-secret',
        });
        expect(new TextDecoder().decode(await storage.read('notes.md', 5))).toBe('hello');
        expect(ranges).toEqual(['bytes=0-4']);
    } finally {
        await server.stop(true);
    }
});
async function* chunks(bytes: Uint8Array) {
    yield bytes;
}
function xml(body: string) {
    return new Response(body, { headers: { 'content-type': 'application/xml' } });
}
