import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    type ArtifactThumbnailState,
    artifactRevisionsTable as revisions,
} from '../postgres/schema.ts';
import { type ArtifactStorage, artifactThumbnailKey } from './storage.ts';
import {
    artifactThumbnailSourceMaxBytes,
    isThumbnailSource,
    renderArtifactThumbnail,
} from './thumbnail-render.ts';

/** The revision facts thumbnail generation reads. */
export interface ThumbnailRevision {
    byteSize: number;
    contentType: string;
    id: string;
    objectKey: string;
    thumbnailState: ArtifactThumbnailState | null;
}

export interface ArtifactThumbnailsOptions {
    /** Concurrent renders; each decodes a full original into memory. */
    concurrency?: number;
    /** Reports a revision whose thumbnail failed; never throws into the caller. */
    logFailure(revisionId: string, reason: 'decode' | 'record' | 'storage', cause: unknown): void;
    render?: (source: Uint8Array) => Promise<Uint8Array>;
}

/**
 * Generates each raster revision's WebP thumbnail once: eagerly after a publish, and lazily on
 * the first thumbnail read for revisions published before thumbnails existed. One render per
 * revision runs at a time across both paths. A source over the byte or pixel cap
 * (`thumbnail-render.ts`), or one that does not decode, is marked `failed` and keeps its kind
 * icon; a storage error stays retryable on the next read.
 */
export class ArtifactThumbnails {
    readonly #db: HausDatabase;
    readonly #storage: ArtifactStorage;
    readonly #options: ArtifactThumbnailsOptions;
    readonly #inFlight = new Map<string, Promise<boolean>>();
    readonly #waiting: (() => void)[] = [];
    #running = 0;
    #closed = false;

    constructor(db: HausDatabase, storage: ArtifactStorage, options: ArtifactThumbnailsOptions) {
        this.#db = db;
        this.#storage = storage;
        this.#options = options;
    }

    /** Whether the revision has a thumbnail, generating it first when it has none yet. */
    ensure(revision: ThumbnailRevision): Promise<boolean> {
        if (revision.thumbnailState) {
            return Promise.resolve(revision.thumbnailState === 'ready');
        }
        if (this.#closed || !isThumbnailSource(revision.contentType)) {
            return Promise.resolve(false);
        }
        let pending = this.#inFlight.get(revision.id);
        if (!pending) {
            pending = this.#queued(() => this.#generate(revision))
                .catch((cause: unknown) => {
                    this.#options.logFailure(revision.id, 'record', cause);
                    return false;
                })
                .finally(() => {
                    this.#inFlight.delete(revision.id);
                });
            this.#inFlight.set(revision.id, pending);
        }
        return pending;
    }

    /** Stops taking work and waits for renders in flight, which write to the database. */
    async close() {
        this.#closed = true;
        await Promise.allSettled(this.#inFlight.values());
    }

    async #generate(revision: ThumbnailRevision): Promise<boolean> {
        if (this.#closed) {
            return false;
        }
        if (revision.byteSize > artifactThumbnailSourceMaxBytes) {
            // Too large to buffer for a render: record it so no read retries, and keep the icon.
            await this.#mark(revision.id, 'failed');
            return false;
        }
        let source: Uint8Array;
        try {
            source = await this.#storage.read(revision.objectKey, revision.byteSize);
        } catch (cause) {
            this.#options.logFailure(revision.id, 'storage', cause);
            return false;
        }
        let thumbnail: Uint8Array;
        try {
            thumbnail = await (this.#options.render ?? renderArtifactThumbnail)(source);
        } catch (cause) {
            this.#options.logFailure(revision.id, 'decode', cause);
            await this.#mark(revision.id, 'failed');
            return false;
        }
        const key = artifactThumbnailKey(revision.objectKey);
        try {
            await this.#storage.upload(key, chunks(thumbnail), 'image/webp');
            if (await this.#mark(revision.id, 'ready')) {
                return true;
            }
            // Deleted or pruned while rendering: its cleanup already ran, so drop the orphan.
            await this.#storage.delete(key);
        } catch (cause) {
            this.#options.logFailure(revision.id, 'storage', cause);
        }
        return false;
    }

    /** Records the outcome only while the revision is still live; false when it is gone. */
    async #mark(revisionId: string, state: ArtifactThumbnailState) {
        const updated = await this.#db
            .update(revisions)
            .set({ thumbnailState: state })
            .where(and(eq(revisions.id, revisionId), eq(revisions.state, 'ready')))
            .returning({ id: revisions.id });
        return updated.length > 0;
    }

    async #queued<T>(work: () => Promise<T>): Promise<T> {
        if (this.#running >= (this.#options.concurrency ?? 2)) {
            // A finishing render hands its slot straight to the next waiter.
            await new Promise<void>((resolve) => this.#waiting.push(resolve));
        } else {
            this.#running += 1;
        }
        try {
            return await work();
        } finally {
            const next = this.#waiting.shift();
            if (next) {
                next();
            } else {
                this.#running -= 1;
            }
        }
    }
}

async function* chunks(bytes: Uint8Array) {
    yield bytes;
}
