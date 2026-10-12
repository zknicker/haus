import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { decodeAttachmentImage } from './attachment-image.ts';

let onDecode: () => void = () => undefined;

class FakeImage {
    naturalHeight = 30;
    naturalWidth = 40;
    src = '';
    decode() {
        onDecode();
        return Promise.resolve();
    }
}

const originalImage = globalThis.Image;
let created: string[] = [];
let revoked: string[] = [];
let nextUrl = 0;

beforeEach(() => {
    created = [];
    revoked = [];
    onDecode = () => undefined;
    globalThis.Image = FakeImage as unknown as typeof Image;
    spyOn(URL, 'createObjectURL').mockImplementation(() => {
        // Unique across tests: the module's reference counts outlive each test.
        nextUrl += 1;
        const url = `blob:test/${nextUrl}`;
        created.push(url);
        return url;
    });
    spyOn(URL, 'revokeObjectURL').mockImplementation((url: string) => {
        revoked.push(url);
    });
});

afterEach(() => {
    globalThis.Image = originalImage;
    (URL.createObjectURL as unknown as { mockRestore(): void }).mockRestore();
    (URL.revokeObjectURL as unknown as { mockRestore(): void }).mockRestore();
});

describe('decodeAttachmentImage', () => {
    test('a decoded image keeps its object URL for the cache entry to own', async () => {
        const image = await decodeAttachmentImage(new Blob(['x']), new AbortController().signal);

        expect(image).toEqual({ height: 30, url: created[0] ?? '', width: 40 });
        expect(revoked).toEqual([]);
    });

    test('a query cancelled during decode revokes the URL nobody will own', async () => {
        const controller = new AbortController();
        onDecode = () => controller.abort();

        await expect(decodeAttachmentImage(new Blob(['x']), controller.signal)).rejects.toBe(
            controller.signal.reason
        );
        expect(revoked).toEqual(created);
        expect(created).toHaveLength(1);
    });
});
