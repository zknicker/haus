import { agentConnectionGrantInputSchema, CONNECTION_ADMIN_REQUIRED } from '@haus/api';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { HausDatabase } from '../postgres/connection.ts';
import { mcpUpdatedTopic } from '../realtime/topics.ts';
import {
    ConnectionAdminRequiredError,
    McpGrantDisconnectedError,
    McpGrantScopeError,
} from '../server-mcp/grant-errors.ts';
import { authorizeAgentRunner, sendAgentApiError } from './auth.ts';
import {
    ConnectionTargetError,
    changeAgentConnectionGrant,
    listAgentConnections,
} from './connections.ts';

const adminNextAction =
    'Ask a Server Owner or Admin to turn on Connection admin for you on your Agent profile under Connections, or to change the access themselves.';

/**
 * The connection admin surface (`haus connection`): list connections and who may use them, and
 * turn one Agent's access to one connection on or off. Only an Agent a Server Owner or Admin
 * made a connection admin may call these; adding, signing in to, or removing connections stays
 * with humans in Settings.
 */
export function registerAgentConnectionRoutes(app: FastifyInstance, db: HausDatabase) {
    app.get('/api/agent/connections', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        if (!runner) {
            return missingToken(reply);
        }
        try {
            return await listAgentConnections(db, runner);
        } catch (cause) {
            return sendConnectionFailure(reply, cause);
        }
    });

    for (const [action, enabled] of [
        ['grant', true],
        ['revoke', false],
    ] as const) {
        app.post(`/api/agent/connections/${action}`, async (request, reply) => {
            const runner = await authorizeAgentRunner(db, request);
            if (!runner) {
                return missingToken(reply);
            }
            const parsed = agentConnectionGrantInputSchema.safeParse(request.body);
            if (!parsed.success) {
                return sendAgentApiError(
                    reply,
                    400,
                    'INVALID_ARG',
                    'Name one Agent with --agent and one connection with --connection.'
                );
            }
            try {
                const receipt = await changeAgentConnectionGrant(db, runner, {
                    ...parsed.data,
                    enabled,
                });
                // The audit line: ids only, never names or secrets.
                request.log.info(
                    {
                        actingAgentId: runner.agentId,
                        changed: receipt.changed,
                        connectionId: receipt.connection.id,
                        enabled,
                        serverId: runner.serverId,
                        targetAgentId: receipt.agent.id,
                    },
                    'agent connection grant'
                );
                if (receipt.changed) {
                    mcpUpdatedTopic.announce({ serverId: runner.serverId });
                }
                return receipt;
            } catch (cause) {
                return sendConnectionFailure(reply, cause);
            }
        });
    }
}

function sendConnectionFailure(reply: FastifyReply, cause: unknown): unknown {
    if (cause instanceof ConnectionAdminRequiredError) {
        return sendAgentApiError(reply, 403, CONNECTION_ADMIN_REQUIRED, cause.message, {
            nextAction: adminNextAction,
        });
    }
    if (cause instanceof ConnectionTargetError) {
        return sendAgentApiError(
            reply,
            cause.code === 'AMBIGUOUS_TARGET' ? 409 : 404,
            cause.code,
            cause.message,
            { nextAction: 'Run haus connection list for exact names and ids.' }
        );
    }
    if (cause instanceof McpGrantDisconnectedError) {
        return sendAgentApiError(reply, 409, 'CONNECTION_NOT_CONNECTED', cause.message, {
            nextAction:
                'Ask a Server Owner or Admin to reconnect it in Settings → Connections, then grant again.',
        });
    }
    if (cause instanceof McpGrantScopeError) {
        return sendAgentApiError(reply, 404, 'AGENT_NOT_FOUND', cause.message);
    }
    return sendAgentApiError(
        reply,
        500,
        'SERVER_5XX',
        'The Server could not change connection access.'
    );
}

function missingToken(reply: FastifyReply): unknown {
    return sendAgentApiError(reply, 401, 'MISSING_TOKEN', 'A valid runner credential is required.');
}
