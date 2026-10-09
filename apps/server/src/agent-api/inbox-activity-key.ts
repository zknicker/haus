import { agentInboxActivityKeySchema } from '@haus/api';

/**
 * The opaque keyset position of an Agent inbox row: its newest message's
 * `created_at` (UTC, microseconds) and id. Clients copy it from the `More:`
 * line and never parse it.
 */
export interface InboxActivityPosition {
    /** Fixed-width UTC ISO with microseconds, so string order is time order. */
    createdAt: string;
    id: string;
}

const separator = '\u0000';
const createdAtPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u;
const base64urlPattern = /^[A-Za-z0-9_-]+$/u;

export function encodeInboxActivityKey(position: InboxActivityPosition): string {
    return Buffer.from(`${position.createdAt}${separator}${position.id}`, 'utf8').toString(
        'base64url'
    );
}

/** The position a key names, or null when the key is not one this Server issued. */
export function decodeInboxActivityKey(key: string): InboxActivityPosition | null {
    if (!(agentInboxActivityKeySchema.safeParse(key).success && base64urlPattern.test(key))) {
        return null;
    }
    const decoded = Buffer.from(key, 'base64url').toString('utf8');
    const parts = decoded.split(separator);
    if (parts.length !== 2) {
        return null;
    }
    const [createdAt = '', id = ''] = parts;
    if (!createdAtPattern.test(createdAt) || id.length === 0) {
        return null;
    }
    const position = { createdAt, id };
    // Only the canonical spelling round-trips, so a key never aliases another.
    return encodeInboxActivityKey(position) === key ? position : null;
}

/** Newest first: later `created_at`, then the greater id on a tie. */
export function compareInboxActivity(a: InboxActivityPosition, b: InboxActivityPosition): number {
    if (a.createdAt !== b.createdAt) {
        return a.createdAt < b.createdAt ? 1 : -1;
    }
    if (a.id === b.id) {
        return 0;
    }
    return a.id < b.id ? 1 : -1;
}
