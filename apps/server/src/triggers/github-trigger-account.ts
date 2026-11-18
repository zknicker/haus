import type { AgentGithubTriggerConfigInput, GithubTriggerConfigInput } from '@haus/api';
import { and, eq, ne } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentMcpConnectionGrantsTable,
    githubInstallationsTable,
    mcpConnectionsTable,
} from '../postgres/schema.ts';
import { TriggerRequestRefusedError } from './trigger-model.ts';

// An Agent names the GitHub account it watches; the Server picks the
// installation (specs/github-triggers.md#agent-cli-and-manual). Grant,
// suspension, and sign-in refusals stay with authoring, behind the Server lock.

/** Swaps the Agent's `account` login for the Server's live installation on it. */
export async function resolveAgentGithubConfig(
    db: HausDatabase,
    input: { agentId: string; config: AgentGithubTriggerConfigInput; serverId: string }
): Promise<GithubTriggerConfigInput> {
    const { account, ...config } = input.config;
    const installations = await liveInstallations(db, input);
    const installation = installations.find(
        (candidate) => candidate.accountLogin.toLowerCase() === account.toLowerCase()
    );
    if (!installation) {
        const usable = installations
            .filter((candidate) => candidate.usable)
            .map((candidate) => candidate.accountLogin);
        throw new TriggerRequestRefusedError(
            'github_installation_unavailable',
            `No Haus GitHub installation covers ${account}. ${usable.length > 0 ? `You can use: ${usable.join(', ')}. ` : ''}A GitHub owner of ${account} must install the Haus GitHub App, then a Haus Owner or Admin adds it to the GitHub connection and grants you access.`
        );
    }
    return { ...config, installationId: installation.id };
}

/** The Server's bound installations, marked usable when the Agent's grant reaches them. */
async function liveInstallations(db: HausDatabase, input: { agentId: string; serverId: string }) {
    const rows = await db
        .select({
            accountLogin: githubInstallationsTable.accountLogin,
            connected: mcpConnectionsTable.connected,
            grantee: agentMcpConnectionGrantsTable.agentId,
            id: githubInstallationsTable.id,
            status: githubInstallationsTable.status,
        })
        .from(githubInstallationsTable)
        .innerJoin(
            mcpConnectionsTable,
            and(
                eq(mcpConnectionsTable.serverId, githubInstallationsTable.serverId),
                eq(mcpConnectionsTable.id, githubInstallationsTable.connectionId)
            )
        )
        .leftJoin(
            agentMcpConnectionGrantsTable,
            and(
                eq(agentMcpConnectionGrantsTable.serverId, mcpConnectionsTable.serverId),
                eq(agentMcpConnectionGrantsTable.connectionId, mcpConnectionsTable.id),
                eq(agentMcpConnectionGrantsTable.agentId, input.agentId)
            )
        )
        .where(
            and(
                eq(githubInstallationsTable.serverId, input.serverId),
                ne(githubInstallationsTable.status, 'removed')
            )
        )
        .orderBy(githubInstallationsTable.accountLogin);
    return rows.map((row) => ({
        accountLogin: row.accountLogin,
        id: row.id,
        usable: row.connected && row.grantee !== null && row.status === 'active',
    }));
}
