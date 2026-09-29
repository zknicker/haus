import { expect, test } from 'bun:test';
import { decodeProtectedHeader, exportPKCS8, generateKeyPair, jwtVerify } from 'jose';
import { ApnsProviderToken } from './apns-provider-token.ts';

async function generateApnsKey() {
    const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
    return { privateKey: await exportPKCS8(privateKey), publicKey };
}

test('signs an ES256 provider token with the key id, team id, and issue time', async () => {
    const key = await generateApnsKey();
    let now = Date.UTC(2026, 8, 29, 12, 0, 0);
    const signer = await ApnsProviderToken.create(
        { keyId: 'KEY1234567', privateKey: key.privateKey, teamId: 'XJ8RZZT99R' },
        () => now
    );

    const token = await signer.current();
    expect(decodeProtectedHeader(token)).toEqual({ alg: 'ES256', kid: 'KEY1234567' });
    const { payload } = await jwtVerify(token, key.publicKey, {
        currentDate: new Date(now),
        issuer: 'XJ8RZZT99R',
    });
    expect(payload).toEqual({ iat: now / 1000, iss: 'XJ8RZZT99R' });

    // Reused inside 40 minutes and re-minted after.
    now += 39 * 60 * 1000;
    expect(await signer.current()).toBe(token);
    now += 2 * 60 * 1000;
    const refreshed = await signer.current();
    expect(refreshed).not.toBe(token);
});

test('invalidating re-mints only once the token is 20 minutes old', async () => {
    const key = await generateApnsKey();
    let now = Date.UTC(2026, 8, 29, 12, 0, 0);
    const signer = await ApnsProviderToken.create(
        { keyId: 'KEY1234567', privateKey: key.privateKey, teamId: 'XJ8RZZT99R' },
        () => now
    );
    const token = await signer.current();

    now += 19 * 60 * 1000;
    expect(signer.invalidate()).toBe(false);
    expect(await signer.current()).toBe(token);

    now += 60 * 1000;
    expect(signer.invalidate()).toBe(true);
    expect(await signer.current()).not.toBe(token);
});

test('accepts a PEM whose newlines arrived escaped on one line', async () => {
    const key = await generateApnsKey();
    const signer = await ApnsProviderToken.create({
        keyId: 'KEY1234567',
        privateKey: key.privateKey.trim().replaceAll('\n', '\\n'),
        teamId: 'XJ8RZZT99R',
    });
    await jwtVerify(await signer.current(), key.publicKey);
});
