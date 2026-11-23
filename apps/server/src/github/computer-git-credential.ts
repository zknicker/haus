import type {
    ComputerGitCredential,
    ComputerGitCredentialRequest,
    ComputerGitRefusalCode,
} from '@haus/api';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { isAgentAllowedOn } from '../computer-access/agent-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentInvocationsTable,
    agentMcpConnectionGrantsTable,
    agentsTable,
    githubInstallationsTable,
    repoFoldersTable,
} from '../postgres/schema.ts';
import { GithubApiError } from './github-api.ts';
import type { createScopedInstallationTokens } from './installation-tokens.ts';

type Reader = Pick<HausDatabase, 'select'>;
type ScopedTokens = ReturnType<typeof createScopedInstallationTokens>;

/**
 * A token for git on a Computer, scoped to one repo, as the Server's Haus
 * GitHub App (ADR 0060 decision 5). `write` serves an open Agent invocation on
 * that Computer and needs the Agent's grant on the GitHub connection; `read`
 * serves the Computer's own cleanup fetch of an Agent's worktree. Both need a
 * folder for the repo on that Computer and the App installed on its owner.
 */
export async function issueComputerGitCredential(
    db: Reader,
    tokens: ScopedTokens,
    computer: { id: string; serverId: string },
    request: ComputerGitCredentialRequest
) {
    const { repository } = request;
    const agentId =
        request.access === 'write'
            ? await openInvocationAgent(db, computer, request.invocationId)
            : await serverAgent(db, computer.serverId, request.agentId);
    if (agentId === null) {
        return request.access === 'write'
            ? refused('invocation_not_open', 'Only a running Agent command gets a GitHub token.')
            : refused('agent_not_allowed', 'That Agent is not on this Server.');
    }
    if (
        request.access === 'write' &&
        !(await isAgentAllowedOn(db, { agentId, computerId: computer.id, serverId: computer.serverId }))
    ) {
        return refused('agent_not_allowed', 'This Agent no longer has access to this Computer.');
    }
    if (!(await hasFolder(db, computer, repository))) {
        return refused(
            'repo_folder_missing',
            `This Computer has no folder for ${repository}, so Haus gives no GitHub token for it. Ask the person who attached it to add one.`
        );
    }
    const [owner = '', name = ''] = repository.split('/');
    const installation = await liveInstallation(db, computer.serverId, owner);
    if (!installation) {
        return needsAccess(repository);
    }
    if (
        request.access === 'write' &&
        !(await hasConnectionGrant(db, computer.serverId, agentId, installation.connectionId))
    ) {
        return refused(
            'github_connection_not_granted',
            `This Agent has no access to the GitHub connection, so it cannot push to ${repository} as the Haus GitHub App. Ask an Owner or Admin to give it access in Settings → Connections → GitHub.`
        );
    }
    try {
        const token = await tokens.read(installation.installationId, {
            permissions: { contents: request.access },
            repositories: [name],
        });
        const credential: ComputerGitCredential = {
            expiresAt: new Date(token.expiresAt).toISOString(),
            token: token.token,
        };
        return { credential, kind: 'token' as const };
    } catch (cause) {
        if (cause instanceof GithubApiError && cause.failure !== 'retryable') {
            return needsAccess(repository);
        }
        throw cause;
    }
}

function needsAccess(repository: string) {
    const [owner] = repository.split('/');
    return refused(
        'github_app_needs_access',
        `The Haus GitHub App needs access to ${repository}. Ask an Owner or Admin to install it on ${owner} with access to ${repository}.`
    );
}

function refused(code: ComputerGitRefusalCode, message: string) {
    return { code, kind: 'refused' as const, message };
}

async function openInvocationAgent(
    db: Reader,
    computer: { id: string; serverId: string },
    invocationId: string
) {
    const [invocation] = await db
        .select({ agentId: agentInvocationsTable.agentId })
        .from(agentInvocationsTable)
        .where(
            and(
                eq(agentInvocationsTable.id, invocationId),
                eq(agentInvocationsTable.serverId, computer.serverId),
                eq(agentInvocationsTable.computerId, computer.id),
                inArray(agentInvocationsTable.state, ['sent', 'accepted'])
            )
        )
        .limit(1);
    return invocation?.agentId ?? null;
}

async function serverAgent(db: Reader, serverId: string, agentId: string) {
    const [agent] = await db
        .select({ id: agentsTable.id })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, serverId), eq(agentsTable.id, agentId)))
        .limit(1);
    return agent?.id ?? null;
}

async function hasFolder(
    db: Reader,
    computer: { id: string; serverId: string },
    repository: string
) {
    const [folder] = await db
        .select({ path: repoFoldersTable.path })
        .from(repoFoldersTable)
        .where(
            and(
                eq(repoFoldersTable.serverId, computer.serverId),
                eq(repoFoldersTable.computerId, computer.id),
                eq(repoFoldersTable.repository, repository)
            )
        )
        .limit(1);
    return folder !== undefined;
}

async function liveInstallation(db: Reader, serverId: string, owner: string) {
    const [installation] = await db
        .select({
            connectionId: githubInstallationsTable.connectionId,
            installationId: githubInstallationsTable.installationId,
        })
        .from(githubInstallationsTable)
        .where(
            and(
                eq(githubInstallationsTable.serverId, serverId),
                eq(githubInstallationsTable.status, 'active'),
                eq(sql`lower(${githubInstallationsTable.accountLogin})`, owner)
            )
        )
        .limit(1);
    return installation ?? null;
}

async function hasConnectionGrant(
    db: Reader,
    serverId: string,
    agentId: string,
    connectionId: string | null
) {
    if (connectionId === null) {
        return false;
    }
    const [grant] = await db
        .select({ agentId: agentMcpConnectionGrantsTable.agentId })
        .from(agentMcpConnectionGrantsTable)
        .where(
            and(
                eq(agentMcpConnectionGrantsTable.serverId, serverId),
                eq(agentMcpConnectionGrantsTable.agentId, agentId),
                eq(agentMcpConnectionGrantsTable.connectionId, connectionId)
            )
        )
        .limit(1);
    return grant !== undefined;
}

export type ComputerGitCredentialAnswer = Awaited<ReturnType<typeof issueComputerGitCredential>>;
