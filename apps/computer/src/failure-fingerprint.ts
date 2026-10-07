import { createHash } from 'node:crypto';

/**
 * Hashes raw runtime failure text so the Server can recognize a repeating failure without ever
 * seeing the text. Volatile tokens (ids, hex, numbers) normalize away so the same failure with a
 * new request id still matches. Returns undefined when there is no text to fingerprint.
 */
export function failureFingerprint(rawText: string): string | undefined {
    const normalized = rawText
        .toLowerCase()
        .replace(uuidPattern, '<uuid>')
        .replace(prefixedIdPattern, '<id>')
        .replace(hexRunPattern, '<hex>')
        .replace(numberPattern, '<num>')
        .replace(/\s+/gu, ' ')
        .trim();
    if (!normalized) {
        return;
    }
    return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

const uuidPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gu;
// Provider request ids such as `req_011cxyz…`: a short prefix and a digit-bearing token.
const prefixedIdPattern = /\b[a-z]{2,8}_(?=[0-9a-z]*\d)[0-9a-z]{10,}\b/gu;
const hexRunPattern = /\b[0-9a-f]{12,}\b/gu;
const numberPattern = /\b\d+\b/gu;
