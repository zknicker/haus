import { createHmac, timingSafeEqual } from 'node:crypto';

const signaturePrefix = 'sha256=';
const hexDigestLength = 64;

/**
 * Checks `X-Hub-Signature-256` against the HMAC-SHA256 of the exact bytes
 * GitHub sent. The header is shape-checked first so the constant-time compare
 * always sees two equal-length digests; a malformed header is a mismatch.
 */
export function verifyGithubSignature(input: {
    body: Buffer;
    header: string;
    secret: string;
}): boolean {
    const { header } = input;
    if (!header.startsWith(signaturePrefix)) {
        return false;
    }
    const presented = header.slice(signaturePrefix.length);
    if (presented.length !== hexDigestLength || !/^[0-9a-f]+$/iu.test(presented)) {
        return false;
    }
    const expected = createHmac('sha256', input.secret).update(input.body).digest();
    return timingSafeEqual(expected, Buffer.from(presented, 'hex'));
}

/** The header value GitHub would send for `body`; tests sign fixtures with it. */
export function signGithubPayload(secret: string, body: Buffer | string): string {
    return `${signaturePrefix}${createHmac('sha256', secret).update(body).digest('hex')}`;
}
