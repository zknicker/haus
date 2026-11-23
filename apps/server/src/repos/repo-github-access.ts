import type { RepoGithubAccess } from '@haus/api';
import { and, asc, eq, ne } from 'drizzle-orm';
import { GithubApiError } from '../github/github-api.ts';
import type { GithubApp } from '../github/github-app.ts';
import { createScopedInstallationTokens } from '../github/installation-tokens.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { githubInstallationsTable, mcpConnectionsTable } from '../postgres/schema.ts';

type Reader = Pick<HausDatabase, 'select'>;
type Installation = Pick<
    typeof githubInstallationsTable.$inferSelect,
    | 'accountId'
    | 'accountLogin'
    | 'accountType'
    | 'installationId'
    | 'repositorySelection'
    | 'status'
>;

export async function readRepoGithubAccess(db: Reader, app: GithubApp | null, serverId: string) {
    const connectionId = await readGithubConnectionId(db, serverId);
    if (!(app && connectionId)) {
        return {
            accessOf: (_repository: string) =>
                Promise.resolve<RepoGithubAccess>({ status: 'github-not-connected' }),
            connectionId,
        };
    }
    const installations = await readLiveInstallations(db, serverId);
    const tokens = scopedTokensOf(app);
    return {
        accessOf: (repository: string) => {
            const [owner = '', name = ''] = repository.split('/');
            return installationAccess(tokens, installations.get(owner) ?? null, name);
        },
        connectionId,
    };
}

async function installationAccess(
    tokens: ScopedTokens,
    installation: Installation | null,
    name: string
) {
    if (!installation) {
        return { installation: null, status: 'app-needs-access' } as const;
    }
    const needsAccess = {
        installation: {
            account: {
                id: installation.accountId,
                login: installation.accountLogin,
                type: installation.accountType,
            },
            githubInstallationId: installation.installationId,
        },
        status: 'app-needs-access',
    } as const;
    if (installation.status !== 'active') {
        return needsAccess;
    }
    if (installation.repositorySelection === 'all') {
        return { status: 'ready' } as const;
    }
    try {
        await tokens.read(installation.installationId, {
            permissions: { contents: 'read' },
            repositories: [name],
        });
        return { status: 'ready' } as const;
    } catch (cause) {
        if (cause instanceof GithubApiError) {
            return cause.failure === 'retryable'
                ? ({ status: 'github-unavailable' } as const)
                : needsAccess;
        }
        throw cause;
    }
}

async function readGithubConnectionId(db: Reader, serverId: string) {
    const [connection] = await db
        .select({ id: mcpConnectionsTable.id })
        .from(mcpConnectionsTable)
        .where(
            and(
                eq(mcpConnectionsTable.serverId, serverId),
                eq(mcpConnectionsTable.preset, 'github')
            )
        )
        .orderBy(asc(mcpConnectionsTable.createdAt))
        .limit(1);
    return connection?.id ?? null;
}

async function readLiveInstallations(db: Reader, serverId: string) {
    const rows = await db
        .select({
            accountId: githubInstallationsTable.accountId,
            accountLogin: githubInstallationsTable.accountLogin,
            accountType: githubInstallationsTable.accountType,
            installationId: githubInstallationsTable.installationId,
            repositorySelection: githubInstallationsTable.repositorySelection,
            status: githubInstallationsTable.status,
        })
        .from(githubInstallationsTable)
        .where(
            and(
                eq(githubInstallationsTable.serverId, serverId),
                ne(githubInstallationsTable.status, 'removed')
            )
        )
        .orderBy(asc(githubInstallationsTable.createdAt));
    const byOwner = new Map<string, Installation>();
    for (const row of rows) {
        const owner = row.accountLogin.toLowerCase();
        if (!byOwner.has(owner) || row.status === 'active') {
            byOwner.set(owner, row);
        }
    }
    return byOwner;
}

type ScopedTokens = ReturnType<typeof createScopedInstallationTokens>;
const scopedTokens = new WeakMap<GithubApp, ScopedTokens>();

function scopedTokensOf(app: GithubApp) {
    const held = scopedTokens.get(app);
    if (held) {
        return held;
    }
    const created = createScopedInstallationTokens(app);
    scopedTokens.set(app, created);
    return created;
}
