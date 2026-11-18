import type { QueryClient } from '@tanstack/react-query';
import { fetchAttachmentBlob, isRetryableAttachmentError } from './attachment-bytes.ts';

/**
 * A decoded attachment image: an object URL the browser has already decoded,
 * plus its natural size, so a tile can lay out at its final aspect ratio on
 * the first frame instead of growing when the bytes arrive.
 */
export interface AttachmentImage {
    height: number;
    url: string;
    width: number;
}

/** The bytes are not an image this browser can draw (HEIC in Chrome, a corrupt file). */
export class AttachmentImageDecodeError extends Error {
    constructor() {
        super('This image cannot be displayed.');
        this.name = 'AttachmentImageDecodeError';
    }
}

const gcTime = 10 * 60_000;

export const attachmentImageKeys = {
    hosted: (serverId: string, attachmentId: string) =>
        ['attachment-image', 'hosted', serverId, attachmentId] as const,
    /** Keyed by the composer attachment nonce, which is also the upload nonce. */
    local: (nonce: string) => ['attachment-image', 'local', nonce] as const,
};

/**
 * Attachment bytes never change under an id, so a decoded image is fresh
 * forever and survives virtualized remounts. Transient failures (no session
 * yet, a dropped connection, a 403 while the publishing message lands) retry
 * with backoff; an error state refetches on the next mount, so it never sticks.
 */
export function hostedAttachmentImageQuery(input: { attachmentId: string; serverId: string }) {
    return {
        gcTime,
        queryFn: async ({ signal }: { signal: AbortSignal }) =>
            await decodeAttachmentImage(await fetchAttachmentBlob({ ...input, signal }), signal),
        queryKey: attachmentImageKeys.hosted(input.serverId, input.attachmentId),
        retry: (failureCount: number, error: Error) =>
            failureCount < 4 && isRetryableAttachmentError(error),
        retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 8000),
        staleTime: Number.POSITIVE_INFINITY,
    };
}

export function localAttachmentImageQuery(input: { file: Blob; nonce: string }) {
    return {
        gcTime,
        queryFn: async () => await decodeAttachmentImage(input.file),
        queryKey: attachmentImageKeys.local(input.nonce),
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
    };
}

/**
 * Hands an uploaded image to its durable id: the confirmed row then paints the
 * very URL the composer and pending row already decoded, so a send never
 * flashes or re-downloads. Without a local entry, the File is decoded instead.
 */
export async function seedHostedAttachmentImage(
    queryClient: QueryClient,
    input: { attachmentId: string; file: Blob; nonce: string; serverId: string }
) {
    watchAttachmentImageRevocation(queryClient);
    const hostedKey = attachmentImageKeys.hosted(input.serverId, input.attachmentId);
    const local = queryClient.getQueryData<AttachmentImage>(attachmentImageKeys.local(input.nonce));
    if (local) {
        queryClient.setQueryData(hostedKey, { ...local, url: retainObjectUrl(local.url) });
        return;
    }
    await queryClient.prefetchQuery({
        ...localAttachmentImageQuery(input),
        queryKey: hostedKey,
    });
}

/**
 * A cancelled query discards its result, so no cache entry would ever own the
 * URL: once `signal` aborts, the URL is released here instead of leaking.
 */
export async function decodeAttachmentImage(
    blob: Blob,
    signal?: AbortSignal
): Promise<AttachmentImage> {
    const url = retainObjectUrl(URL.createObjectURL(blob));
    const image = new Image();
    image.src = url;
    try {
        await decodeImage(image);
    } catch {
        releaseObjectUrl(url);
        throw new AttachmentImageDecodeError();
    }
    if (signal?.aborted) {
        releaseObjectUrl(url);
        throw signal.reason;
    }
    if (image.naturalWidth === 0 || image.naturalHeight === 0) {
        releaseObjectUrl(url);
        throw new AttachmentImageDecodeError();
    }
    return { height: image.naturalHeight, url, width: image.naturalWidth };
}

/**
 * Each cache entry owns one reference to its object URL; the URL is revoked
 * when the last entry holding it is garbage-collected or replaced.
 */
export function watchAttachmentImageRevocation(queryClient: QueryClient) {
    if (watchedClients.has(queryClient)) {
        return;
    }
    watchedClients.add(queryClient);
    const owned = new Map<string, string>();
    queryClient.getQueryCache().subscribe((event) => {
        const { query } = event;
        if (query.queryKey[0] !== 'attachment-image') {
            return;
        }
        const previous = owned.get(query.queryHash);
        const current =
            event.type === 'removed'
                ? undefined
                : (query.state.data as AttachmentImage | undefined)?.url;
        if (previous === current) {
            return;
        }
        if (previous) {
            releaseObjectUrl(previous);
        }
        if (current) {
            owned.set(query.queryHash, current);
        } else {
            owned.delete(query.queryHash);
        }
    });
}

const watchedClients = new WeakSet<QueryClient>();
const objectUrlRefs = new Map<string, number>();

function retainObjectUrl(url: string) {
    objectUrlRefs.set(url, (objectUrlRefs.get(url) ?? 0) + 1);
    return url;
}

function releaseObjectUrl(url: string) {
    const refs = (objectUrlRefs.get(url) ?? 1) - 1;
    if (refs > 0) {
        objectUrlRefs.set(url, refs);
        return;
    }
    objectUrlRefs.delete(url);
    URL.revokeObjectURL(url);
}

function decodeImage(image: HTMLImageElement) {
    if (typeof image.decode === 'function') {
        return image.decode();
    }
    return new Promise<void>((resolve, reject) => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => reject(new AttachmentImageDecodeError()), {
            once: true,
        });
    });
}
