import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, type KeyObject, SignJWT } from 'jose';

/**
 * Serves a JWKS the Server can verify against, so tests exercise real
 * Clerk session-token verification instead of stubbing the identity boundary.
 * Tokens carry the `azp` authorized party Clerk puts on real session tokens:
 * the origin of the frontend that asked for them.
 */
export interface ClerkTestIssuer {
    close(): Promise<void>;
    /** A session token whose lifetime has already run out. */
    mintExpiredSessionToken(clerkUserId: string): Promise<string>;
    /**
     * Extra claims let tests prove Clerk Organization claims carry no
     * authority, and let them override `azp` to stand in for another frontend
     * on the same Clerk instance.
     */
    mintSessionToken(clerkUserId: string, claims?: Record<string, unknown>): Promise<string>;
    /**
     * Stands in for the Clerk Backend API's verified-email lookup, so the
     * Server can run its real invitation boundary against this issuer.
     */
    setVerifiedEmails(clerkUserId: string, emails: string[]): void;
    url: string;
}

const keyId = 'haus-test-key';
const defaultTokenLifetimeSeconds = 300;
const expiredTokenAgeSeconds = 600;

export async function startClerkTestIssuer(
    appOrigin: string,
    options: { sessionTokenLifetimeSeconds?: number } = {}
): Promise<ClerkTestIssuer> {
    const tokenLifetimeSeconds = options.sessionTokenLifetimeSeconds ?? defaultTokenLifetimeSeconds;
    const authorizedParty = new URL(appOrigin).origin;
    const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
    const jwk = await exportJWK(publicKey as KeyObject);
    const jwks = JSON.stringify({ keys: [{ ...jwk, alg: 'RS256', kid: keyId, use: 'sig' }] });

    const verifiedEmails = new Map<string, string[]>();
    const server = createServer((request, response) => {
        if (request.url === '/.well-known/jwks.json') {
            response.writeHead(200, { 'content-type': 'application/json' });
            response.end(jwks);
            return;
        }

        const lookup = request.url?.match(/^\/v1\/users\/([^/?]+)$/u);

        if (lookup) {
            const clerkUserId = decodeURIComponent(lookup[1]);
            response.writeHead(200, { 'content-type': 'application/json' });
            response.end(
                JSON.stringify({
                    email_addresses: (verifiedEmails.get(clerkUserId) ?? []).map((email) => ({
                        email_address: email,
                        verification: { status: 'verified' },
                    })),
                    id: clerkUserId,
                })
            );
            return;
        }

        response.writeHead(404);
        response.end();
    });

    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
    });

    const { port } = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}`;

    return {
        close: () =>
            new Promise<void>((resolve) => {
                server.closeAllConnections();
                server.close(() => resolve());
            }),
        mintExpiredSessionToken(clerkUserId) {
            const expiredAt = Math.floor(Date.now() / 1000) - expiredTokenAgeSeconds;

            return new SignJWT({ azp: authorizedParty })
                .setProtectedHeader({ alg: 'RS256', kid: keyId })
                .setIssuer(url)
                .setSubject(clerkUserId)
                .setIssuedAt(expiredAt - tokenLifetimeSeconds)
                .setExpirationTime(expiredAt)
                .sign(privateKey);
        },
        mintSessionToken(clerkUserId, claims = {}) {
            return new SignJWT({ azp: authorizedParty, ...claims })
                .setProtectedHeader({ alg: 'RS256', kid: keyId })
                .setIssuer(url)
                .setSubject(clerkUserId)
                .setIssuedAt()
                .setExpirationTime(`${tokenLifetimeSeconds}s`)
                .sign(privateKey);
        },
        setVerifiedEmails(clerkUserId, emails) {
            verifiedEmails.set(clerkUserId, emails);
        },
        url,
    };
}
