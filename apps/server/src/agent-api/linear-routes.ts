import type { AgentLinearWorkspace, AgentLinearWorkspaces } from '@haus/api';
import { and, asc, eq, isNotNull, isNull, ne } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { readTeamAccess } from '../linear/team-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentMcpConnectionGrantsTable,
    linearCredentialsTable,
    linearIdentitiesTable,
    linearWorkspacesTable,
} from '../postgres/schema.ts';
import { authorizeAgentRunner, sendAgentApiError } from './auth.ts';

/**
 * `haus linear workspaces`: the bound Linear workspaces on connections the
 * calling Agent holds the grant on, with the workspace actor's teams and
 * whether the Agent has its own Linear identity there. The runner credential
 * fixes the Agent and Server.
 */
export function registerAgentLinearRoutes(
    app: FastifyInstance,
    options: { clock?: { now(): Date }; db: HausDatabase }
) {
    const clock = options.clock ?? { now: () => new Date() };
    app.get('/api/agent/linear/workspaces', async (request, reply) => {
        const runner = await authorizeAgentRunner(options.db, request);
        if (!runner) {
            return sendAgentApiError(
                reply,
                401,
                'MISSING_TOKEN',
                'A valid runner credential is required.'
            );
        }
        const rows = await grantedWorkspaces(options.db, runner);
        const now = clock.now();
        const workspaces: AgentLinearWorkspace[] = [];
        for (const row of rows) {
            if (!row.workspace.connectionId) {
                continue;
            }
            const teams = row.credentialId
                ? (await readTeamAccess(options.db, row.credentialId, now)).teams
                : [];
            workspaces.push({
                connectionId: row.workspace.connectionId,
                hasIdentity: row.identityId !== null,
                id: row.workspace.id,
                name: row.workspace.name,
                status: row.workspace.status,
                teams,
                urlKey: row.workspace.urlKey,
            });
        }
        return { workspaces } satisfies AgentLinearWorkspaces;
    });
}

async function grantedWorkspaces(db: HausDatabase, runner: { agentId: string; serverId: string }) {
    return await db
        .select({
            credentialId: linearCredentialsTable.id,
            identityId: linearIdentitiesTable.id,
            workspace: linearWorkspacesTable,
        })
        .from(linearWorkspacesTable)
        .innerJoin(
            agentMcpConnectionGrantsTable,
            and(
                eq(agentMcpConnectionGrantsTable.serverId, linearWorkspacesTable.serverId),
                eq(agentMcpConnectionGrantsTable.connectionId, linearWorkspacesTable.connectionId),
                eq(agentMcpConnectionGrantsTable.agentId, runner.agentId)
            )
        )
        .leftJoin(
            linearCredentialsTable,
            and(
                eq(linearCredentialsTable.workspaceId, linearWorkspacesTable.id),
                isNull(linearCredentialsTable.identityId)
            )
        )
        .leftJoin(
            linearIdentitiesTable,
            and(
                eq(linearIdentitiesTable.workspaceId, linearWorkspacesTable.id),
                eq(linearIdentitiesTable.agentId, runner.agentId),
                eq(linearIdentitiesTable.status, 'active')
            )
        )
        .where(
            and(
                eq(linearWorkspacesTable.serverId, runner.serverId),
                ne(linearWorkspacesTable.status, 'removed'),
                isNotNull(linearWorkspacesTable.connectionId)
            )
        )
        .orderBy(asc(linearWorkspacesTable.name));
}
