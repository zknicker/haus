import { createHmac, timingSafeEqual } from 'node:crypto';

// The issue chip's thumbnail token (specs/linear-app.md#signed-urls): an
// HMAC-SHA256 over the connection, the Linear asset URL, and the expiry. Only
// `linear.issue` mints one, and only for a member of the connection's Server,
// so holding a live token is the route's whole authorization.

/** How long a minted thumbnail URL stays valid. */
export const linearThumbnailTtlMs = 10 * 60_000;

export interface LinearThumbnailClaim {
    assetUrl: string;
    connectionId: string;
    /** Expiry in epoch seconds. */
    exp: number;
}

/** `<base64url claim>.<base64url signature>`. */
export function signLinearThumbnailToken(
    key: string,
    claim: Omit<LinearThumbnailClaim, 'exp'>,
    now = Date.now()
): string {
    const full: LinearThumbnailClaim = {
        assetUrl: claim.assetUrl,
        connectionId: claim.connectionId,
        exp: Math.floor((now + linearThumbnailTtlMs) / 1000),
    };
    const body = Buffer.from(JSON.stringify(full)).toString('base64url');
    return `${body}.${signature(key, body)}`;
}

/** The claim a token carries, or null when it is malformed, forged, or expired. */
export function verifyLinearThumbnailToken(
    key: string,
    token: string,
    now = Date.now()
): LinearThumbnailClaim | null {
    const [body, sig, extra] = token.split('.');
    if (!(body && sig) || extra !== undefined) {
        return null;
    }
    const expected = Buffer.from(signature(key, body));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
        return null;
    }
    const claim = parseClaim(body);
    if (!claim || claim.exp * 1000 <= now) {
        return null;
    }
    return claim;
}

/**
 * An asset the route may fetch: `https`, host exactly `uploads.linear.app`, no
 * credentials and no port. Anything else would let a token reach another host
 * with the workspace's bearer token attached.
 */
export function isLinearAssetUrl(value: string): boolean {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return false;
    }
    return (
        url.protocol === 'https:' &&
        url.hostname === 'uploads.linear.app' &&
        url.port === '' &&
        url.username === '' &&
        url.password === ''
    );
}

function signature(key: string, body: string) {
    return createHmac('sha256', key).update(`linear-thumbnail\n${body}`).digest('base64url');
}

function parseClaim(body: string): LinearThumbnailClaim | null {
    try {
        const value: unknown = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
        if (
            value &&
            typeof value === 'object' &&
            'assetUrl' in value &&
            'connectionId' in value &&
            'exp' in value &&
            typeof value.assetUrl === 'string' &&
            typeof value.connectionId === 'string' &&
            typeof value.exp === 'number'
        ) {
            return { assetUrl: value.assetUrl, connectionId: value.connectionId, exp: value.exp };
        }
    } catch {
        // A malformed body is simply not a token.
    }
    return null;
}
