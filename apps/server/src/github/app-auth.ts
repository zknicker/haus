import { createPrivateKey } from 'node:crypto';
import { importPKCS8, SignJWT } from 'jose';

/** GitHub refuses an App JWT that lives longer than ten minutes. */
const jwtLifetimeSeconds = 9 * 60;
/** Backdated so a Server clock slightly ahead of GitHub's still signs a valid `iat`. */
const issuedAtSkewSeconds = 60;
/** A cached JWT is replaced this long before it expires. */
const refreshMarginSeconds = 60;

/** Everything the Server needs to act as the Haus GitHub App. */
export interface GithubAppConfig {
    appId: string;
    clientId: string;
    clientSecret: string;
    /** The PEM GitHub generated: PKCS #1 (`BEGIN RSA PRIVATE KEY`) or PKCS #8. */
    privateKey: string;
    slug: string;
    webhookSecret: string;
}

export interface GithubAppEnvironment {
    HAUS_GITHUB_APP_CLIENT_ID?: string;
    HAUS_GITHUB_APP_CLIENT_SECRET?: string;
    HAUS_GITHUB_APP_ID?: string;
    HAUS_GITHUB_APP_PRIVATE_KEY?: string;
    HAUS_GITHUB_APP_SLUG?: string;
    HAUS_GITHUB_APP_WEBHOOK_SECRET?: string;
}

/**
 * The App is configured only when every value is present. A partial set is
 * unconfigured: the GitHub connection reports unavailable and the webhook
 * answers 503, rather than half-working.
 */
export function readGithubAppConfig(environment: GithubAppEnvironment): GithubAppConfig | null {
    const {
        HAUS_GITHUB_APP_CLIENT_ID: clientId,
        HAUS_GITHUB_APP_CLIENT_SECRET: clientSecret,
        HAUS_GITHUB_APP_ID: appId,
        HAUS_GITHUB_APP_PRIVATE_KEY: privateKey,
        HAUS_GITHUB_APP_SLUG: slug,
        HAUS_GITHUB_APP_WEBHOOK_SECRET: webhookSecret,
    } = environment;
    if (!(appId && clientId && clientSecret && privateKey && slug && webhookSecret)) {
        return null;
    }
    return { appId, clientId, clientSecret, privateKey, slug, webhookSecret };
}

export interface GithubAppJwtSigner {
    /** An RS256 App JWT valid for at least another minute. Never logged or stored. */
    jwt(): Promise<string>;
}

/**
 * Signs App JWTs (`iss` = app id, `iat` 60 s back, `exp` 9 minutes on) and
 * reuses one until a minute before it expires. The key stays in memory.
 */
export async function createGithubAppJwtSigner(
    credentials: Pick<GithubAppConfig, 'appId' | 'privateKey'>,
    now: () => number = Date.now
): Promise<GithubAppJwtSigner> {
    const key = await importGithubAppKey(credentials.privateKey);
    let cached: { expiresAt: number; token: string } | null = null;
    return {
        async jwt() {
            const nowSeconds = Math.floor(now() / 1000);
            if (cached && cached.expiresAt - refreshMarginSeconds > nowSeconds) {
                return cached.token;
            }
            const issuedAt = nowSeconds - issuedAtSkewSeconds;
            const expiresAt = nowSeconds + jwtLifetimeSeconds;
            const token = await new SignJWT({})
                .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
                .setIssuer(credentials.appId)
                .setIssuedAt(issuedAt)
                .setExpirationTime(expiresAt)
                .sign(key);
            cached = { expiresAt, token };
            return token;
        },
    };
}

/**
 * GitHub hands out PKCS #1 keys, which `jose` does not import, so the key is
 * re-encoded as PKCS #8 first. A single-line field may carry `\n` escapes.
 */
async function importGithubAppKey(pem: string): Promise<CryptoKey> {
    const trimmed = pem.trim();
    const normalized = trimmed.includes('\n') ? trimmed : trimmed.replaceAll('\\n', '\n');
    const pkcs8 = createPrivateKey(normalized).export({ format: 'pem', type: 'pkcs8' });
    return await importPKCS8(pkcs8.toString(), 'RS256');
}
