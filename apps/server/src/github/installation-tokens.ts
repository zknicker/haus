import * as z from 'zod';
import { GithubApiError, githubRequest } from './github-api.ts';
import type { GithubApp } from './github-app.ts';

/** GitHub issues installation tokens for an hour; replace one well before that. */
const tokenRefreshMarginMs = 5 * 60_000;

const installationTokenSchema = z.object({
    expires_at: z.iso.datetime(),
    token: z.string().min(1),
});

export interface InstallationToken {
    expiresAt: number;
    token: string;
}

/** A narrower token: one repository, and only the permissions named. */
export interface InstallationTokenScope {
    permissions: Record<string, 'read' | 'write'>;
    repositories: readonly string[];
}

/** Mints and caches each installation's token, replacing it well before it expires. */
export function createInstallationTokens(app: GithubApp, now: () => number = Date.now) {
    const cache = createTokenCache((installationId: number) => mintInstallationToken(app, installationId), now);
    return {
        forget: (installationId: number) => cache.forget(String(installationId)),
        read: async (installationId: number) =>
            (await cache.read(String(installationId), installationId)).token,
    };
}

/** Mints and caches scoped tokens, one per installation, repository and permission set. */
export function createScopedInstallationTokens(app: GithubApp, now: () => number = Date.now) {
    const cache = createTokenCache(
        (input: { installationId: number; scope: InstallationTokenScope }) =>
            mintInstallationToken(app, input.installationId, input.scope),
        now
    );
    return {
        read: (installationId: number, scope: InstallationTokenScope) =>
            cache.read(JSON.stringify([installationId, scope]), { installationId, scope }),
    };
}

export async function mintInstallationToken(
    app: GithubApp,
    installationId: number,
    scope?: InstallationTokenScope
) {
    const { body } = await githubRequest(
        {
            ...(scope
                ? {
                      body: {
                          permissions: scope.permissions,
                          repositories: [...scope.repositories],
                      },
                  }
                : {}),
            credential: { jwt: await app.signer.jwt(), kind: 'app' },
            method: 'POST',
            path: `/app/installations/${installationId}/access_tokens`,
        },
        app.transport
    );
    const parsed = installationTokenSchema.safeParse(body);
    if (!parsed.success) {
        throw new GithubApiError(
            'retryable',
            null,
            'GitHub sent an unreadable installation token.'
        );
    }
    const token: InstallationToken = {
        expiresAt: Date.parse(parsed.data.expires_at),
        token: parsed.data.token,
    };
    return token;
}

function createTokenCache<Input>(
    mint: (input: Input) => Promise<InstallationToken>,
    now: () => number
) {
    const cached = new Map<string, InstallationToken>();
    const minting = new Map<string, Promise<InstallationToken>>();
    return {
        forget(key: string) {
            cached.delete(key);
        },
        read(key: string, input: Input): Promise<InstallationToken> {
            const held = cached.get(key);
            if (held && held.expiresAt - tokenRefreshMarginMs > now()) {
                return Promise.resolve(held);
            }
            const pending = minting.get(key);
            if (pending) {
                return pending;
            }
            const started = mint(input)
                .then((token) => {
                    cached.set(key, token);
                    return token;
                })
                .finally(() => minting.delete(key));
            minting.set(key, started);
            return started;
        },
    };
}
