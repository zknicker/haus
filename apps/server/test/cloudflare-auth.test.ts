import { expect, test } from 'bun:test';
import { createCloudflareAdmissions } from '../src/identity/cloudflare-access.ts';
import { createCloudflareOAuthMetadataReader } from '../src/identity/cloudflare-oauth-metadata.ts';
import { startCloudflareTestIssuer } from './cloudflare-test-issuer.ts';

test('verifies an Access assertion and normalizes its trusted email', async () => {
    const issuer = await startCloudflareTestIssuer();
    try {
        const admissions = createCloudflareAdmissions({
            audience: issuer.audience,
            issuer: issuer.url,
        });
        const assertion = await issuer.mintAssertion({
            email: '  Owner@Haus.Test ',
            subject: 'cf-subject-owner',
        });

        await expect(admissions.verify(assertion)).resolves.toMatchObject({
            email: 'owner@haus.test',
            identitySubject: 'cf-subject-owner',
        });
    } finally {
        await issuer.close();
    }
});

test('rejects an expired assertion, a non-app token, and the wrong issuer audience', async () => {
    const issuer = await startCloudflareTestIssuer();
    const otherIssuer = await startCloudflareTestIssuer('another-audience');
    try {
        const admissions = createCloudflareAdmissions({
            audience: issuer.audience,
            issuer: issuer.url,
        });
        await expect(
            admissions.verify(await issuer.mintAssertion({ expiresInSeconds: -1 }))
        ).rejects.toThrow();
        await expect(
            admissions.verify(await issuer.mintAssertion({ type: 'service' }))
        ).rejects.toThrow(/human identity/u);
        await expect(admissions.verify(await otherIssuer.mintAssertion({}))).rejects.toThrow();
    } finally {
        await issuer.close();
        await otherIssuer.close();
    }
});

test('reads Managed OAuth metadata from the team issuer and requires S256 without client secrets', async () => {
    const requests: URL[] = [];
    const reader = createCloudflareOAuthMetadataReader({
        issuer: 'https://thearcade.cloudflareaccess.com',
        fetch: async (input) => {
            requests.push(new URL(input.toString()));
            return Response.json({
                authorization_endpoint:
                    'https://thearcade.cloudflareaccess.com/cdn-cgi/access/oauth/authorization',
                code_challenge_methods_supported: ['S256'],
                grant_types_supported: ['authorization_code', 'refresh_token'],
                issuer: 'https://thearcade.cloudflareaccess.com',
                revocation_endpoint:
                    'https://thearcade.cloudflareaccess.com/cdn-cgi/access/oauth/revoke',
                response_types_supported: ['code'],
                token_endpoint: 'https://thearcade.cloudflareaccess.com/cdn-cgi/access/oauth/token',
                token_endpoint_auth_methods_supported: ['none'],
            });
        },
    });

    await expect(reader.read()).resolves.toMatchObject({
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
    });
    expect(requests.map((url) => url.pathname)).toEqual([
        '/.well-known/oauth-authorization-server',
    ]);
});
