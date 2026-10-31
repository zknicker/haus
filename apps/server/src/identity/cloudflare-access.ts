import { createRemoteJWKSet, customFetch, type FetchImplementation, jwtVerify } from 'jose';

export const cloudflareAccessIssuer = 'https://thearcade.cloudflareaccess.com';
export const cloudflareAccessAudience =
    'e9298671cbce8a755003fe6a98b8f0f4d2afd30d617b648df47f20f61c5f78e3';
export const cloudflareNativeClientId = '36213553-ce73-4d1b-bb9a-ffb09e4e9f68';
export const cloudflareAuthResource = 'https://haus.chat/auth/session';
export const cloudflareAuthRedirectUri = 'https://haus.chat/auth/callback';

export interface CloudflareAdmission {
    email: string;
    expiresAt: number;
    identitySubject: string;
    issuedAt: number;
}

export interface CloudflareAdmissions {
    verify(assertion: string): Promise<CloudflareAdmission>;
}

export class CloudflareAdmissionUnavailableError extends Error {
    constructor() {
        super('Could not reach the sign-in service. Try again.');
        this.name = 'CloudflareAdmissionUnavailableError';
    }
}

export interface CloudflareAccessOptions {
    audience?: string;
    fetch?: FetchImplementation;
    issuer?: string;
    resolveDeadlineMs?: number;
}

const jwksFetchTimeoutMs = 5000;
const defaultResolveDeadlineMs = 7000;

export function createCloudflareAdmissions(
    options: CloudflareAccessOptions = {}
): CloudflareAdmissions {
    const issuer = new URL(options.issuer ?? cloudflareAccessIssuer);
    const expectedIssuer = issuer.origin;
    const audience = options.audience ?? cloudflareAccessAudience;
    const deadlineMs = options.resolveDeadlineMs ?? defaultResolveDeadlineMs;
    const createKeys = () =>
        createRemoteJWKSet(new URL('/cdn-cgi/access/certs', issuer), {
            timeoutDuration: jwksFetchTimeoutMs,
            ...(options.fetch ? { [customFetch]: options.fetch } : {}),
        });
    let keys = createKeys();

    return {
        async verify(assertion) {
            const resolving = keys;
            const { payload } = await withDeadline(
                jwtVerify(assertion, resolving, {
                    algorithms: ['RS256'],
                    audience,
                    issuer: expectedIssuer,
                }),
                deadlineMs,
                () => {
                    if (keys === resolving) {
                        keys = createKeys();
                    }
                }
            );

            const now = Date.now();
            if (
                payload.type !== 'app' ||
                typeof payload.sub !== 'string' ||
                payload.sub.length === 0 ||
                typeof payload.email !== 'string' ||
                payload.email.trim().length === 0 ||
                typeof payload.iat !== 'number' ||
                typeof payload.exp !== 'number' ||
                payload.exp * 1000 <= now ||
                payload.iat * 1000 > now + 60_000
            ) {
                throw new Error('Cloudflare Access assertion is not a live human identity.');
            }

            // Access's signed `email` claim is supplied by the identity provider
            // as a verified address. `identity_nonce` is deliberately not used
            // as a Haus session id or account key.
            return {
                email: payload.email.trim().toLowerCase(),
                expiresAt: payload.exp * 1000,
                identitySubject: payload.sub,
                issuedAt: payload.iat * 1000,
            };
        },
    };
}

async function withDeadline<T>(work: Promise<T>, deadline: number, onMissed: () => void) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const missed = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new CloudflareAdmissionUnavailableError()), deadline);
    });
    work.catch(() => undefined);
    try {
        return await Promise.race([work, missed]);
    } catch (cause) {
        if (cause instanceof CloudflareAdmissionUnavailableError) {
            onMissed();
        }
        throw cause;
    } finally {
        clearTimeout(timer);
    }
}
