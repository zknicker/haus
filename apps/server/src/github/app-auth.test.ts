import { describe, expect, test } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';
import { decodeJwt, decodeProtectedHeader, importSPKI, jwtVerify } from 'jose';
import { createGithubAppJwtSigner, readGithubAppConfig } from './app-auth.ts';

// GitHub generates PKCS #1 keys; the signer must take those as well as PKCS #8.
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { format: 'pem', type: 'pkcs1' },
    publicKeyEncoding: { format: 'pem', type: 'spki' },
});
const startedAt = Date.parse('2026-10-11T12:00:00.000Z');

describe('GitHub App JWT', () => {
    test('signs RS256 with the app id, iat 60 s back, and exp 9 minutes on', async () => {
        const signer = await createGithubAppJwtSigner(
            { appId: '123456', privateKey },
            () => startedAt
        );
        const token = await signer.jwt();
        const nowSeconds = startedAt / 1000;

        expect(decodeProtectedHeader(token)).toEqual({ alg: 'RS256', typ: 'JWT' });
        const claims: Record<string, unknown> = { ...decodeJwt(token) };
        expect(claims).toEqual({
            exp: nowSeconds + 540,
            iat: nowSeconds - 60,
            iss: '123456',
        });
        const verified = await jwtVerify(token, await importSPKI(publicKey, 'RS256'), {
            currentDate: new Date(startedAt),
        });
        expect(verified.payload.iss).toBe('123456');
    });

    test('reuses a token until a minute before expiry, then signs a fresh one', async () => {
        let now = startedAt;
        const signer = await createGithubAppJwtSigner({ appId: '1', privateKey }, () => now);
        const first = await signer.jwt();

        now += 7 * 60 * 1000;
        expect(await signer.jwt()).toBe(first);
        now += 60 * 1000 + 1000;
        const second = await signer.jwt();
        expect(second).not.toBe(first);
        expect(decodeJwt(second).iat).toBe(Math.floor(now / 1000) - 60);
    });

    test('accepts a single-line PEM with literal \\n escapes', async () => {
        const escaped = privateKey.trim().replaceAll('\n', '\\n');
        const signer = await createGithubAppJwtSigner(
            { appId: '1', privateKey: escaped },
            () => startedAt
        );
        expect(decodeJwt(await signer.jwt()).iss).toBe('1');
    });

    test('refuses a key that is not a private key', async () => {
        await expect(
            createGithubAppJwtSigner({ appId: '1', privateKey: 'not a key' })
        ).rejects.toThrow();
    });
});

describe('GitHub App configuration', () => {
    const complete = {
        HAUS_GITHUB_APP_CLIENT_ID: 'Iv23client',
        HAUS_GITHUB_APP_CLIENT_SECRET: 'client-secret',
        HAUS_GITHUB_APP_ID: '123456',
        HAUS_GITHUB_APP_PRIVATE_KEY: privateKey,
        HAUS_GITHUB_APP_SLUG: 'haus-dev',
        HAUS_GITHUB_APP_WEBHOOK_SECRET: 'w'.repeat(32),
    };

    test('is configured only when every value is present', () => {
        expect(readGithubAppConfig(complete)).toMatchObject({ appId: '123456', slug: 'haus-dev' });
        expect(readGithubAppConfig({ ...complete, HAUS_GITHUB_APP_PRIVATE_KEY: undefined })).toBe(
            null
        );
        expect(readGithubAppConfig({})).toBe(null);
    });
});
