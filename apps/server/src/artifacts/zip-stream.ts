import { Zip, ZipPassThrough } from 'fflate';
import type { ArtifactStorage } from './storage.ts';
import type { ZipEntry } from './zip-plan.ts';

interface OpenEntry {
    entry: ZipEntry;
    file: ZipPassThrough;
    read: number;
    reader: ReadableStreamDefaultReader<Uint8Array>;
}

/**
 * Streams `entries` as one zip archive, each stored uncompressed (STORE): shared files are mostly
 * PNG, JPEG, and WebP, which deflate cannot shrink, so the archive costs no CPU and its bytes are
 * the originals. The stream is pull-driven: it reads the next storage chunk only when the client
 * is ready for more, so a slow download never buffers whole files, and one object is open at a
 * time. Cancelling (the client went away) cancels the open storage read. An object whose bytes
 * do not match its recorded size errors the stream rather than writing a corrupt member.
 */
export function streamArtifactZip(
    storage: ArtifactStorage,
    entries: readonly ZipEntry[]
): ReadableStream<Uint8Array> {
    let next = 0;
    let open: OpenEntry | null = null;
    let emitted = 0;
    let finished = false;
    let zip: Zip | null = null;

    /** One step: open the next member, copy one storage chunk, close a member, or end. */
    const step = async () => {
        if (!zip) {
            return;
        }
        if (!open) {
            const entry = entries[next];
            next += 1;
            if (!entry) {
                zip.end();
                return;
            }
            const file = new ZipPassThrough(entry.name);
            file.mtime = entry.modifiedAt;
            zip.add(file);
            open = { entry, file, read: 0, reader: storage.stream(entry.objectKey).getReader() };
            return;
        }
        const chunk = await open.reader.read();
        if (chunk.done) {
            if (open.read !== open.entry.size) {
                throw new Error(
                    `Stored bytes for \`${open.entry.name}\` were ${open.read}, expected ${open.entry.size}.`
                );
            }
            open.file.push(new Uint8Array(0), true);
            open = null;
            return;
        }
        open.read += chunk.value.byteLength;
        open.file.push(chunk.value);
    };

    return new ReadableStream<Uint8Array>({
        start(controller) {
            zip = new Zip((error, chunk, final) => {
                if (error) {
                    finished = true;
                    controller.error(error);
                    return;
                }
                emitted += 1;
                controller.enqueue(chunk);
                if (final) {
                    finished = true;
                    controller.close();
                }
            });
        },
        // A pull that enqueues nothing is never called again, so step until bytes come out.
        async pull() {
            const before = emitted;
            while (emitted === before && !finished) {
                await step();
            }
        },
        async cancel(reason) {
            finished = true;
            zip?.terminate();
            await open?.reader.cancel(reason);
            open = null;
        },
    });
}
