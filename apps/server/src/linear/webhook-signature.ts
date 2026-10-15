import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const hexDigestLength = 64;
/** Linear signs `webhookTimestamp`; a delivery older or newer than this is refused (Q7). */
export const linearWebhookFreshnessMs = 60_000;
/**
 * Checked when a receiver has no secret (an unknown or removed identity), so
 * its refusal costs what a real mismatch costs.
 */
const decoySecret = randomBytes(32).toString('hex');

/**
 * Checks `Linear-Signature` (hex HMAC-SHA256 of the raw bytes) against every
 * secret the receiver currently accepts: its current one and, during
 * rotation, its previous one. The header is shape-checked first so the
 * constant-time compare always sees equal-length digests, and every secret is
 * tried so the answer does not depend on which one matched.
 */
export function verifyLinearSignature(input: {
    body: Buffer;
    header: string;
    secrets: readonly string[];
}): boolean {
    const presented = parseDigest(input.header);
    const secrets = input.secrets.length > 0 ? input.secrets : [decoySecret];
    let matched = false;
    for (const secret of secrets) {
        const expected = createHmac('sha256', secret).update(input.body).digest();
        const equal = presented !== null && timingSafeEqual(expected, presented);
        matched = equal || matched;
    }
    return matched && input.secrets.length > 0;
}

/** Whether `webhookTimestamp` (epoch milliseconds) is within a minute of now, either way. */
export function isFreshLinearDelivery(webhookTimestamp: unknown, now: Date): boolean {
    return (
        typeof webhookTimestamp === 'number' &&
        Number.isFinite(webhookTimestamp) &&
        Math.abs(now.getTime() - webhookTimestamp) <= linearWebhookFreshnessMs
    );
}

/** The header value Linear would send for `body`; tests sign fixtures with it. */
export function signLinearPayload(secret: string, body: Buffer | string): string {
    return createHmac('sha256', secret).update(body).digest('hex');
}

function parseDigest(header: string): Buffer | null {
    const value = header.trim();
    if (value.length !== hexDigestLength || !/^[0-9a-f]+$/iu.test(value)) {
        return null;
    }
    return Buffer.from(value, 'hex');
}
