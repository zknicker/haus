import { importPKCS8, SignJWT } from 'jose';

/** APNs refuses a token older than an hour and one refreshed more than every 20 minutes. */
const tokenLifetimeMs = 40 * 60 * 1000;
/** APNs answers `TooManyProviderTokenUpdates` to a refresh inside 20 minutes. */
const minimumRefreshMs = 20 * 60 * 1000;

export interface ApnsCredentials {
    keyId: string;
    /** The `.p8` PEM contents (PKCS #8, P-256). */
    privateKey: string;
    teamId: string;
}

/**
 * Mints the ES256 provider token APNs authenticates every request with
 * (header `kid` = key id, claims `iss` = team id and `iat`), reusing one token
 * for 40 minutes. `invalidate` forces a fresh one after APNs calls it expired,
 * but never within 20 minutes of the last mint.
 */
export class ApnsProviderToken {
    private cached: { expiresAt: number; issuedAt: number; token: string } | null = null;

    private constructor(
        private readonly credentials: ApnsCredentials,
        private readonly key: CryptoKey,
        private readonly now: () => number
    ) {}

    static async create(
        credentials: ApnsCredentials,
        now: () => number = Date.now
    ): Promise<ApnsProviderToken> {
        const key = await importPKCS8(normalizePem(credentials.privateKey), 'ES256');
        return new ApnsProviderToken(credentials, key, now);
    }

    async current(): Promise<string> {
        const now = this.now();
        if (this.cached && this.cached.expiresAt > now) {
            return this.cached.token;
        }
        const token = await new SignJWT({})
            .setProtectedHeader({ alg: 'ES256', kid: this.credentials.keyId })
            .setIssuer(this.credentials.teamId)
            .setIssuedAt(Math.floor(now / 1000))
            .sign(this.key);
        this.cached = { expiresAt: now + tokenLifetimeMs, issuedAt: now, token };
        return token;
    }

    /** Drops the cached token unless it is too young to refresh; says whether it did. */
    invalidate(): boolean {
        if (this.cached && this.now() - this.cached.issuedAt < minimumRefreshMs) {
            return false;
        }
        this.cached = null;
        return true;
    }
}

/** A PEM pasted into a single-line field arrives with literal `\n` escapes. */
function normalizePem(value: string) {
    const trimmed = value.trim();
    return trimmed.includes('\n') ? trimmed : trimmed.replaceAll('\\n', '\n');
}
