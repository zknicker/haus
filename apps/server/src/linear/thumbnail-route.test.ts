import { describe, expect, test } from 'bun:test';
import { ledgerToolSummary } from './issue-reference.ts';
import { firstLinearImage } from './issue-reference-read.ts';
import { linearThumbnailMaxBytes, proxyLinearThumbnail } from './thumbnail-route.ts';
import {
    isLinearAssetUrl,
    signLinearThumbnailToken,
    verifyLinearThumbnailToken,
} from './thumbnail-token.ts';

const key = 'k'.repeat(32);
const now = Date.UTC(2026, 9, 15, 12);
const asset = 'https://uploads.linear.app/org/abc/def.png';

function token(assetUrl = asset, at = now) {
    return signLinearThumbnailToken(key, { assetUrl, connectionId: 'mcp_linear' }, at);
}

function deps(response: () => Response, calls: RequestInit[] = []) {
    return {
        connectionAccessToken: async (connectionId: string) =>
            connectionId === 'mcp_linear' ? 'lin_token' : null,
        now: () => now,
        signingKey: key,
        transport: (async (_url: string | URL | Request, init?: RequestInit) => {
            calls.push(init ?? {});
            return response();
        }) as typeof fetch,
    };
}

describe('linear thumbnail token', () => {
    test('round-trips within ten minutes and expires after', () => {
        expect(verifyLinearThumbnailToken(key, token(), now)?.assetUrl).toBe(asset);
        expect(verifyLinearThumbnailToken(key, token(), now + 10 * 60_000)).toBeNull();
    });

    test('refuses a forged or tampered token', () => {
        const [body, sig] = token().split('.');
        expect(verifyLinearThumbnailToken('x'.repeat(32), token(), now)).toBeNull();
        expect(verifyLinearThumbnailToken(key, `${body}x.${sig}`, now)).toBeNull();
        expect(verifyLinearThumbnailToken(key, `${body}`, now)).toBeNull();
    });

    test('accepts only Linear upload hosts', () => {
        expect(isLinearAssetUrl(asset)).toBe(true);
        for (const url of [
            'http://uploads.linear.app/a.png',
            'https://uploads.linear.app.evil.com/a.png',
            'https://user@uploads.linear.app/a.png',
            'https://uploads.linear.app:444/a.png',
            'https://linear.app/a.png',
        ]) {
            expect(isLinearAssetUrl(url)).toBe(false);
        }
    });
});

describe('proxyLinearThumbnail', () => {
    test('fetches with the workspace token, refusing redirects', async () => {
        const calls: RequestInit[] = [];
        const result = await proxyLinearThumbnail(
            deps(() => new Response('png', { headers: { 'content-type': 'image/png' } }), calls),
            token()
        );
        expect(result.status).toBe(200);
        expect(calls[0]?.redirect).toBe('error');
        expect(new Headers(calls[0]?.headers).get('authorization')).toBe('Bearer lin_token');
    });

    test('refuses other hosts, expired tokens, bad types, and oversized bodies', async () => {
        const image = () => new Response('png', { headers: { 'content-type': 'image/png' } });
        expect(
            (await proxyLinearThumbnail(deps(image), token('https://evil.com/a.png'))).status
        ).toBe(404);
        expect(
            (await proxyLinearThumbnail(deps(image), token(asset, now - 11 * 60_000))).status
        ).toBe(404);
        const html = () => new Response('<p>', { headers: { 'content-type': 'text/html' } });
        expect((await proxyLinearThumbnail(deps(html), token())).status).toBe(502);
        const huge = () =>
            new Response(new Uint8Array(linearThumbnailMaxBytes + 1), {
                headers: { 'content-type': 'image/png' },
            });
        expect((await proxyLinearThumbnail(deps(huge), token())).status).toBe(502);
        const redirect = () => {
            throw new TypeError('redirect');
        };
        expect((await proxyLinearThumbnail(deps(redirect), token())).status).toBe(502);
    });
});

describe('issue chip helpers', () => {
    test('the first Linear-hosted image is the thumbnail', () => {
        expect(
            firstLinearImage(`![x](https://example.com/a.png) ![y](${asset}) ![z](${asset}2)`)
        ).toBe(asset);
        expect(firstLinearImage('no images')).toBeNull();
    });

    test('ledger tools read as a past-tense change', () => {
        expect(ledgerToolSummary('update_issue')).toBe('Updated issue');
        expect(ledgerToolSummary('create_comment')).toBe('Created comment');
        expect(ledgerToolSummary('frobnicate')).toBe('Changed the issue');
    });
});
