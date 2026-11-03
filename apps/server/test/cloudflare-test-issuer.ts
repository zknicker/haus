import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, type KeyObject, SignJWT } from 'jose';

export interface CloudflareTestIssuer {
    audience: string;
    close(): Promise<void>;
    mintAssertion(input: {
        email?: string;
        expiresInSeconds?: number;
        subject?: string;
        type?: string;
    }): Promise<string>;
    url: string;
}

const keyId = 'haus-cloudflare-test-key';

/** Local RS256 Access issuer for offline Server auth tests. */
export async function startCloudflareTestIssuer(
    audience = 'haus-test-access-audience'
): Promise<CloudflareTestIssuer> {
    const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
    const jwk = await exportJWK(publicKey as KeyObject);
    const jwks = JSON.stringify({ keys: [{ ...jwk, alg: 'RS256', kid: keyId, use: 'sig' }] });
    const server = createServer((request, response) => {
        if (request.url === '/cdn-cgi/access/certs') {
            response.writeHead(200, { 'content-type': 'application/json' });
            response.end(jwks);
            return;
        }
        response.writeHead(404);
        response.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}`;

    return {
        audience,
        close: () =>
            new Promise<void>((resolve) => {
                server.closeAllConnections();
                server.close(() => resolve());
            }),
        async mintAssertion(input = {}) {
            const expiresInSeconds = input.expiresInSeconds ?? 600;
            return await new SignJWT({
                email: input.email ?? 'owner@haus.test',
                type: input.type ?? 'app',
            })
                .setProtectedHeader({ alg: 'RS256', kid: keyId })
                .setIssuer(url)
                .setAudience(audience)
                .setSubject(input.subject ?? 'cf-subject-owner')
                .setIssuedAt()
                .setExpirationTime(`${expiresInSeconds}s`)
                .sign(privateKey);
        },
        url,
    };
}
