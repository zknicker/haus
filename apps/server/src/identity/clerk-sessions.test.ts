import { expect, test } from 'bun:test';
import { exportJWK, type FetchImplementation, generateKeyPair, type JWK, SignJWT } from 'jose';
import { ClerkSessionUnavailableError, createClerkSessions } from './clerk-sessions.ts';

const issuerUrl = 'https://worthy-peacock-11.clerk.accounts.test';
const appOrigin = 'https://app.haus.test';
const keyId = 'clerk-signing-key';

/**
 * A signing-key fetch that hangs is the one failure that can take the whole
 * authenticated surface down at once: jose shares a single in-flight JWKS fetch
 * across every concurrent verification and refetches whenever its cache ages
 * out, so a fetch that never settles is never cleared and every later request
 * waits on the same dead promise for the life of the process.
 */
test('a signing-key fetch that never settles fails its own request and no other', async () => {
    const clerk = await createTestClerkInstance();
    let stall = true;
    const sessions = createClerkSessions(issuerUrl, appOrigin, {
        fetch: (...args) =>
            stall ? new Promise<Response>(() => undefined) : clerk.serveJwks(...args),
        resolveDeadlineMs: 100,
    });
    const token = await clerk.mintToken('user_wedge');

    const started = Date.now();
    await expect(sessions.verify(token)).rejects.toBeInstanceOf(ClerkSessionUnavailableError);
    expect(Date.now() - started).toBeLessThan(2000);

    // The stalled fetch is still pending. The next request must not inherit it.
    stall = false;
    await expect(sessions.verify(token)).resolves.toMatchObject({ clerkUserId: 'user_wedge' });
});

test('a token this App never asked for is refused', async () => {
    const clerk = await createTestClerkInstance();
    const sessions = createClerkSessions(issuerUrl, appOrigin, { fetch: clerk.serveJwks });

    await expect(
        sessions.verify(await clerk.mintToken('user_foreign', 'https://app.example.test'))
    ).rejects.toThrow(/another authorized party/i);
});

interface TestClerkInstance {
    mintToken(subject: string, authorizedParty?: string): Promise<string>;
    serveJwks: FetchImplementation;
}

async function createTestClerkInstance(): Promise<TestClerkInstance> {
    const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
    const jwk: JWK = { ...(await exportJWK(publicKey)), alg: 'RS256', kid: keyId, use: 'sig' };

    return {
        mintToken: (subject, authorizedParty = appOrigin) =>
            new SignJWT({ azp: authorizedParty })
                .setProtectedHeader({ alg: 'RS256', kid: keyId })
                .setIssuer(issuerUrl)
                .setSubject(subject)
                .setIssuedAt()
                .setExpirationTime('5m')
                .sign(privateKey),
        serveJwks: () => Promise.resolve(Response.json({ keys: [jwk] })),
    };
}
