import { triggerPayloadMaxBytes } from '@haus/api';

const ellipsis = '…';

/** Shortens `value` to at most `maxChars` UTF-16 units, never splitting a surrogate pair. */
export function clip(value: string, maxChars: number): string {
    if (value.length <= maxChars) {
        return value;
    }
    let cut = value.slice(0, Math.max(0, maxChars - 1));
    const last = cut.charCodeAt(cut.length - 1);
    if (last >= 0xd8_00 && last <= 0xdb_ff) {
        cut = cut.slice(0, -1);
    }
    return `${cut}${ellipsis}`;
}

/**
 * Serializes a projection (two-space JSON, so the envelope excerpt reads line
 * by line) within the stored payload ceiling. Text gives way first: the
 * longest string is halved until the whole fits. Structure never truncates,
 * so a stored projection always parses.
 */
export function serializeProjection(projection: unknown): string {
    let current = projection;
    for (;;) {
        const serialized = JSON.stringify(current, null, 2);
        if (Buffer.byteLength(serialized) <= triggerPayloadMaxBytes) {
            return serialized;
        }
        const longest = longestString(current);
        if (longest === null || longest < 16) {
            throw new Error('A GitHub projection cannot fit the stored payload ceiling.');
        }
        current = shortenLongest(current, longest);
    }
}

function longestString(value: unknown): number | null {
    if (typeof value === 'string') {
        return value.length;
    }
    if (value === null || typeof value !== 'object') {
        return null;
    }
    let longest: number | null = null;
    for (const child of Object.values(value)) {
        const length = longestString(child);
        if (length !== null && (longest === null || length > longest)) {
            longest = length;
        }
    }
    return longest;
}

/** Halves every string at the current maximum length; everything else is copied. */
function shortenLongest(value: unknown, longest: number): unknown {
    if (typeof value === 'string') {
        return value.length === longest ? clip(value, Math.floor(longest / 2)) : value;
    }
    if (Array.isArray(value)) {
        return value.map((child) => shortenLongest(child, longest));
    }
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, child]) => [key, shortenLongest(child, longest)])
        );
    }
    return value;
}
