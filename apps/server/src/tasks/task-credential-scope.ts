import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { authorizeAgentRunner, sendAgentApiError } from '../agent-api/auth.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';

export function registerTaskCredentialScope(app: FastifyInstance, db: HausDatabase) {
    app.addHook('onRequest', async (request, reply) => {
        const route = request.routeOptions.url;
        if (!(route && request.method !== 'GET' && isOutsideTaskScope(route))) {
            return;
        }
        const runner = await authorizeAgentRunner(db, request);
        if (!(runner && (await isTaskAgent(db, runner)))) {
            return;
        }
        return await sendAgentApiError(
            reply,
            403,
            'TASK_CREDENTIAL_SCOPE',
            'A Task changes only its own chat, its Issues and its own Drive folders.',
            {
                nextAction:
                    'Ask your Captain or a person in your chat, or report it with haus task report.',
            }
        );
    });
}

export function isOutsideTaskScope(route: string) {
    return (
        outsideTaskPrefixes.some((prefix) => route === prefix || route.startsWith(`${prefix}/`)) ||
        /^\/api\/agent\/actions\/(?:delete|publish)-/u.test(route)
    );
}

const outsideTaskPrefixes = [
    '/api/agent/agents',
    '/api/agent/artifacts',
    '/api/agent/channels',
    '/api/agent/claims',
    '/api/agent/connections',
    '/api/agent/drive/push',
    '/api/agent/profile/update',
    '/api/agent/triggers',
];

async function isTaskAgent(db: HausDatabase, runner: { agentId: string; serverId: string }) {
    const [agent] = await db
        .select({ kind: agentsTable.kind })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, runner.serverId), eq(agentsTable.id, runner.agentId)))
        .limit(1);
    return agent?.kind === 'task';
}
