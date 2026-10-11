import type { AgentGithubInstallation, AgentGithubInstallations } from '@haus/api';
import { and, eq, ne } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import * as z from 'zod';
import type { GithubApp } from '../github/github-app.ts';
import { readGithubPickerRepositories } from '../github/repository-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentMcpConnectionGrantsTable,
    githubInstallationsTable,
    mcpConnectionsTable,
} from '../postgres/schema.ts';
import { authorizeAgentRunner, sendAgentApiError } from './auth.ts';

const querySchema = z.object({
    repos: z
        .enum(['true', 'false'])
        .optional()
        .transform((value) => value === 'true'),
});

/**
 * `haus github installations [--repos]`: the live installations on GitHub
 * connections the calling Agent holds the grant on, with their accessible
 * repositories on request. The runner credential fixes the Agent and Server.
 */
export function registerAgentGithubRoutes(
    app: FastifyInstance,
    options: { db: HausDatabase; githubApp: GithubApp | null }
) {
    app.get('/api/agent/github/installations', async (request, reply) => {
        const runner = await authorizeAgentRunner(options.db, request);
        if (!runner) {
            return sendAgentApiError(
                reply,
                401,
                'MISSING_TOKEN',
                'A valid runner credential is required.'
            );
        }
        const parsed = querySchema.safeParse(request.query);
        if (!parsed.success) {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', 'The request was invalid.');
        }
        const rows = await grantedInstallations(options.db, runner);
        const installations: AgentGithubInstallation[] = [];
        for (const row of rows) {
            const installation: AgentGithubInstallation = {
                accessibleRepositoryCount: row.accessibleRepositoryIds.length,
                account: { id: row.accountId, login: row.accountLogin, type: row.accountType },
                githubInstallationId: row.installationId,
                id: row.id,
                repositorySelection: row.repositorySelection,
                status: row.status,
            };
            if (parsed.data.repos && options.githubApp && row.status === 'active') {
                try {
                    installation.repositories = await readGithubPickerRepositories(
                        {
                            clock: { now: () => new Date() },
                            db: options.db,
                            transport: options.githubApp.transport,
                        },
                        row
                    );
                } catch {
                    return sendAgentApiError(
                        reply,
                        502,
                        'GITHUB_UNAVAILABLE',
                        `GitHub did not list repositories for ${row.accountLogin}.`,
                        {
                            nextAction:
                                'Retry shortly, or ask a Server Owner or Admin to sign in to GitHub again.',
                            retryable: true,
                        }
                    );
                }
            }
            installations.push(installation);
        }
        return { installations } satisfies AgentGithubInstallations;
    });
}

async function grantedInstallations(
    db: HausDatabase,
    runner: { agentId: string; serverId: string }
) {
    const rows = await db
        .select({ installation: githubInstallationsTable })
        .from(githubInstallationsTable)
        .innerJoin(
            mcpConnectionsTable,
            and(
                eq(mcpConnectionsTable.serverId, githubInstallationsTable.serverId),
                eq(mcpConnectionsTable.id, githubInstallationsTable.connectionId)
            )
        )
        .innerJoin(
            agentMcpConnectionGrantsTable,
            and(
                eq(agentMcpConnectionGrantsTable.serverId, mcpConnectionsTable.serverId),
                eq(agentMcpConnectionGrantsTable.connectionId, mcpConnectionsTable.id),
                eq(agentMcpConnectionGrantsTable.agentId, runner.agentId)
            )
        )
        .where(
            and(
                eq(githubInstallationsTable.serverId, runner.serverId),
                ne(githubInstallationsTable.status, 'removed'),
                eq(mcpConnectionsTable.connected, true)
            )
        )
        .orderBy(githubInstallationsTable.accountLogin);
    return rows.map((row) => row.installation);
}
