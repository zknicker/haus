/**
 * Last-reported heights of inline visuals, so a re-mounted card reserves its
 * real box before the frame reports instead of opening at the fallback and
 * jumping. App-local presentation cache only: a miss or a stale entry costs one
 * visible resize, and the frame's next report always wins.
 *
 * Keyed by the visual's body (theme tokens are excluded — they change colors,
 * not layout) and by a width bucket, because a visual reflows with its column.
 * Persisted to localStorage as a bounded LRU so reloads open at the right size
 * too; storage failures degrade to the in-memory map.
 */

export type VisualHeightStorage = Pick<Storage, 'getItem' | 'setItem'>;

export interface VisualHeightCache {
    /** Persist pending writes now instead of after the debounce. */
    flush: () => void;
    /**
     * The best known height for a visual: the exact width bucket, else the
     * nearest recorded width, else the most recent one when width is unknown.
     */
    read: (identity: string, width: number | null) => number | null;
    record: (identity: string, width: number, height: number) => void;
}

export const visualHeightStorageKey = 'haus.visualHeights.v1';

// Text reflows at any width; 16px buckets keep a resize from minting a new
// entry per pixel while staying within a line of the real height.
const widthBucketPx = 16;

export function createVisualHeightCache({
    capacity = 200,
    persistDelayMs = 500,
    storage,
    widthsPerVisual = 4,
}: {
    capacity?: number;
    persistDelayMs?: number;
    storage: () => VisualHeightStorage | null;
    widthsPerVisual?: number;
}): VisualHeightCache {
    // Insertion order is recency: oldest first, so eviction takes the head.
    let visuals: Map<string, WidthHeight[]> | null = null;
    let persistTimer: ReturnType<typeof setTimeout> | null = null;

    function entries() {
        visuals ??= load(storage(), capacity, widthsPerVisual);
        return visuals;
    }

    function persist() {
        if (persistTimer !== null) {
            clearTimeout(persistTimer);
            persistTimer = null;
        }
        try {
            storage()?.setItem(visualHeightStorageKey, JSON.stringify([...entries()]));
        } catch {
            // Quota or disabled storage: the in-memory cache still serves this session.
        }
    }

    function schedulePersist() {
        if (persistTimer === null) {
            persistTimer = setTimeout(persist, persistDelayMs);
        }
    }

    return {
        flush: persist,
        read(identity, width) {
            const map = entries();
            const sizes = map.get(identity);
            if (!sizes?.length) {
                return null;
            }
            map.delete(identity);
            map.set(identity, sizes);
            if (width === null || width <= 0) {
                return sizes.at(-1)?.[1] ?? null;
            }
            const bucket = widthBucket(width);
            let best = sizes[0];
            for (const size of sizes) {
                if (Math.abs(size[0] - bucket) < Math.abs(best[0] - bucket)) {
                    best = size;
                }
            }
            return best[1];
        },
        record(identity, width, height) {
            if (!(isPositiveFinite(width) && isPositiveFinite(height))) {
                return;
            }
            const bucket = widthBucket(width);
            const rounded = Math.round(height);
            const map = entries();
            const previous = map.get(identity) ?? [];
            if (previous.at(-1)?.[0] === bucket && previous.at(-1)?.[1] === rounded) {
                return;
            }
            const sizes = [
                ...previous.filter(([w]) => w !== bucket),
                [bucket, rounded] as WidthHeight,
            ];
            map.delete(identity);
            map.set(identity, sizes.slice(-widthsPerVisual));
            for (const oldest of map.keys()) {
                if (map.size <= capacity) {
                    break;
                }
                map.delete(oldest);
            }
            schedulePersist();
        },
    };
}

/** A stable identity for a visual body: content hash plus length. */
export function visualIdentity(html: string): string {
    return `${cyrb53(html).toString(36)}:${html.length.toString(36)}`;
}

export const visualHeightCache = createVisualHeightCache({ storage: browserStorage });

type WidthHeight = [width: number, height: number];

function browserStorage(): VisualHeightStorage | null {
    try {
        return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
        return null;
    }
}

function load(
    store: VisualHeightStorage | null,
    capacity: number,
    widthsPerVisual: number
): Map<string, WidthHeight[]> {
    const map = new Map<string, WidthHeight[]>();
    let raw: string | null = null;
    try {
        raw = store?.getItem(visualHeightStorageKey) ?? null;
    } catch {
        return map;
    }
    if (!raw) {
        return map;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return map;
    }
    if (!Array.isArray(parsed)) {
        return map;
    }
    for (const entry of parsed.slice(-capacity)) {
        if (!Array.isArray(entry) || typeof entry[0] !== 'string' || !Array.isArray(entry[1])) {
            continue;
        }
        const sizes = (entry[1] as unknown[]).filter(isWidthHeight).slice(-widthsPerVisual);
        if (sizes.length) {
            map.set(entry[0], sizes);
        }
    }
    return map;
}

function isWidthHeight(value: unknown): value is WidthHeight {
    return (
        Array.isArray(value) &&
        value.length === 2 &&
        isPositiveFinite(value[0]) &&
        isPositiveFinite(value[1])
    );
}

function isPositiveFinite(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function widthBucket(width: number) {
    return Math.max(widthBucketPx, Math.round(width / widthBucketPx) * widthBucketPx);
}

// 53-bit string hash (cyrb53): fast, well-distributed, not cryptographic. A
// collision only mis-sizes a card until its frame reports.
function cyrb53(value: string) {
    let h1 = 0xde_ad_be_ef;
    let h2 = 0x41_c6_ce_57;
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        h1 = Math.imul(h1 ^ code, 2_654_435_761);
        h2 = Math.imul(h2 ^ code, 1_597_334_677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2_246_822_507) ^ Math.imul(h2 ^ (h2 >>> 13), 3_266_489_909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2_246_822_507) ^ Math.imul(h1 ^ (h1 >>> 13), 3_266_489_909);
    return 4_294_967_296 * (2_097_151 & h2) + (h1 >>> 0);
}
