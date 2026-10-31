import * as z from 'zod';
import { cloudflareAccessIssuer } from './cloudflare-access.ts';

const metadataSchema = z
    .object({
        authorization_endpoint: z.url(),
        code_challenge_methods_supported: z.array(z.string()),
        grant_types_supported: z.array(z.string()),
        issuer: z.url(),
        revocation_endpoint: z.url(),
        response_types_supported: z.array(z.string()),
        token_endpoint: z.url(),
        token_endpoint_auth_methods_supported: z.array(z.string()),
    })
    .passthrough();

export type CloudflareOAuthMetadata = z.infer<typeof metadataSchema>;

export class CloudflareOAuthMetadataError extends Error {
    constructor() {
        super('Cloudflare OAuth configuration is unavailable. Try again.');
        this.name = 'CloudflareOAuthMetadataError';
    }
}

export function createCloudflareOAuthMetadataReader(
    options: { fetch?: typeof fetch; issuer?: string } = {}
) {
    const issuer = new URL(options.issuer ?? cloudflareAccessIssuer);
    const metadataUrl = new URL('/.well-known/oauth-authorization-server', issuer);
    const fetchMetadata = options.fetch ?? fetch;
    let pending: Promise<CloudflareOAuthMetadata> | null = null;

    const read = () => {
        pending ??= fetchCloudflareOAuthMetadata(fetchMetadata, metadataUrl, issuer.origin);
        return pending.catch((cause: unknown) => {
            pending = null;
            throw cause;
        });
    };

    return { read };
}

async function fetchCloudflareOAuthMetadata(
    fetcher: typeof fetch,
    metadataUrl: URL,
    expectedIssuer: string
): Promise<CloudflareOAuthMetadata> {
    let raw: unknown;
    try {
        const response = await fetcher(metadataUrl, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) {
            throw new Error('metadata response was not successful');
        }
        raw = await response.json();
    } catch {
        throw new CloudflareOAuthMetadataError();
    }

    const parsed = metadataSchema.safeParse(raw);
    if (!parsed.success) {
        throw new CloudflareOAuthMetadataError();
    }

    const metadata = parsed.data;
    if (
        new URL(metadata.issuer).origin !== expectedIssuer ||
        metadata.issuer !== expectedIssuer ||
        !metadata.code_challenge_methods_supported.includes('S256') ||
        !metadata.response_types_supported.includes('code') ||
        !metadata.grant_types_supported.includes('authorization_code') ||
        !metadata.grant_types_supported.includes('refresh_token') ||
        !metadata.token_endpoint_auth_methods_supported.includes('none') ||
        !isTrustedEndpoint(metadata.authorization_endpoint, expectedIssuer) ||
        !isTrustedEndpoint(metadata.token_endpoint, expectedIssuer) ||
        !isTrustedEndpoint(metadata.revocation_endpoint, expectedIssuer)
    ) {
        throw new CloudflareOAuthMetadataError();
    }
    return metadata;
}

function isTrustedEndpoint(value: string, expectedOrigin: string) {
    const endpoint = new URL(value);
    return endpoint.protocol === 'https:' && endpoint.origin === expectedOrigin;
}
