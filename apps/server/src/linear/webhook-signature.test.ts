import { describe, expect, test } from 'bun:test';
import {
    isFreshLinearDelivery,
    signLinearPayload,
    verifyLinearSignature,
} from './webhook-signature.ts';

const body = Buffer.from('{"type":"Issue","action":"update","webhookTimestamp":1}');
const secret = 'lin_wh_current';
const previous = 'lin_wh_previous';

describe('verifyLinearSignature', () => {
    test('accepts the HMAC of the exact raw bytes', () => {
        const header = signLinearPayload(secret, body);
        expect(verifyLinearSignature({ body, header, secrets: [secret] })).toBe(true);
        expect(
            verifyLinearSignature({ body, header: header.toUpperCase(), secrets: [secret] })
        ).toBe(true);
    });

    test('refuses a re-serialized body, another secret, and malformed digests', () => {
        const header = signLinearPayload(secret, body);
        const reserialized = Buffer.from(JSON.stringify(JSON.parse(body.toString()), null, 1));
        expect(verifyLinearSignature({ body: reserialized, header, secrets: [secret] })).toBe(
            false
        );
        expect(verifyLinearSignature({ body, header, secrets: ['other'] })).toBe(false);
        expect(verifyLinearSignature({ body, header: header.slice(2), secrets: [secret] })).toBe(
            false
        );
        expect(verifyLinearSignature({ body, header: `sha256=${header}`, secrets: [secret] })).toBe(
            false
        );
        expect(verifyLinearSignature({ body, header: 'z'.repeat(64), secrets: [secret] })).toBe(
            false
        );
    });

    test('accepts the previous secret only while the receiver still lists it', () => {
        const header = signLinearPayload(previous, body);
        expect(verifyLinearSignature({ body, header, secrets: [secret, previous] })).toBe(true);
        expect(verifyLinearSignature({ body, header, secrets: [secret] })).toBe(false);
    });

    test('a receiver with no secrets never verifies, even against the decoy', () => {
        const header = signLinearPayload(secret, body);
        expect(verifyLinearSignature({ body, header, secrets: [] })).toBe(false);
    });
});

describe('isFreshLinearDelivery', () => {
    const now = new Date('2026-10-15T12:00:00.000Z');

    test('allows a minute either way and nothing beyond', () => {
        expect(isFreshLinearDelivery(now.getTime() - 60_000, now)).toBe(true);
        expect(isFreshLinearDelivery(now.getTime() + 60_000, now)).toBe(true);
        expect(isFreshLinearDelivery(now.getTime() - 60_001, now)).toBe(false);
        expect(isFreshLinearDelivery(now.getTime() + 60_001, now)).toBe(false);
    });

    test('refuses a missing or non-numeric timestamp', () => {
        expect(isFreshLinearDelivery(undefined, now)).toBe(false);
        expect(isFreshLinearDelivery(String(now.getTime()), now)).toBe(false);
        expect(isFreshLinearDelivery(Number.NaN, now)).toBe(false);
    });
});
