import { expect, test } from 'bun:test';
import { decodeJwt } from 'jose';
import { startClerkTestIssuer } from './clerk-test-issuer.ts';

test('the test issuer defaults to five-minute session tokens', async () => {
    const issuer = await startClerkTestIssuer('https://app.haus.test');
    try {
        expect(lifetime(await issuer.mintSessionToken('user_fixture'))).toBe(300);
    } finally {
        await issuer.close();
    }
});

test('long App runs can use longer fixture sessions while expired tokens stay expired', async () => {
    const issuer = await startClerkTestIssuer('https://app.haus.test', {
        sessionTokenLifetimeSeconds: 3600,
    });
    try {
        expect(lifetime(await issuer.mintSessionToken('user_fixture'))).toBe(3600);
        const expired = decodeJwt(await issuer.mintExpiredSessionToken('user_fixture'));
        expect(expired.exp).toBeLessThan(Date.now() / 1000);
    } finally {
        await issuer.close();
    }
});

function lifetime(token: string) {
    const { exp, iat } = decodeJwt(token);
    if (typeof exp !== 'number' || typeof iat !== 'number') {
        throw new Error('Fixture session tokens must carry issue and expiry times.');
    }
    return exp - iat;
}
