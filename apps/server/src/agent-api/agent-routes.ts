import {
    agentCreateAgentRequestSchema,
    agentSetAgentAvatarInputSchema,
    agentUpdateAgentInputSchema,
} from '@haus/api';
import type { FastifyInstance } from 'fastify';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { AvatarImageService } from '../avatar-generation/service.ts';
import { emitDurableChatEvent } from '../chats/durable-events.ts';
import { emitServerUpdated } from '../haus-api/server-events.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createAgentFromAgent } from '../server-agents/create-agent-from-agent.ts';
import { precheckAgentCreation } from '../server-agents/creation-request.ts';
import { setAgentAvatarFromAgent } from '../server-agents/set-agent-avatar-from-agent.ts';
import {
    resolveEditableAgent,
    updateAgentDescription,
} from '../server-agents/update-agent-description.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import { generateCreationAvatar, sendAgentRouteFailure } from './agent-route-failures.ts';
import { authorizeAgentRunner, sendAgentApiError } from './auth.ts';
import { describeInvalidAgentProfileWrite } from './description-invalid.ts';

/**
 * The Agent-scoped Agent routes. Any active managed Agent of the Server may
 * call them: the runner credential is the authority, exactly as it is for
 * messages, Tasks, and Cloud Agent work. Cove's identity stays product-owned,
 * so update and avatar refuse it.
 */
export function registerAgentAgentRoutes(
    app: FastifyInstance,
    dependencies: {
        agentDelivery: AgentDelivery;
        avatarImageService: AvatarImageService;
        db: HausDatabase;
        postCommitWork: ServerPostCommitWork;
    }
) {
    app.post('/api/agent/agents', async (request, reply) => {
        const runner = await authorizeAgentRunner(dependencies.db, request);
        if (!runner) {
            return missingToken(reply);
        }
        const parsed = agentCreateAgentRequestSchema.safeParse(request.body);
        if (!parsed.success) {
            return sendAgentApiError(
                reply,
                400,
                'INVALID_ARG',
                describeInvalidAgentProfileWrite(parsed.error, 'The Agent request was invalid.')
            );
        }
        try {
            // Reject stale context or invalid channels before spending a generation.
            const precheck = await precheckAgentCreation(dependencies.db, runner, parsed.data);
            // Generation is a long provider round trip, so it finishes before
            // the transaction opens and never holds the Server row lock — and a
            // replay skips it, because the Agent it would illustrate is already
            // wearing the avatar the first request generated.
            const avatar = precheck.replayed
                ? { bytes: null, outcome: { status: 'none' as const } }
                : await generateCreationAvatar(
                      dependencies.avatarImageService,
                      runner,
                      parsed.data
                  );
            const created = await createAgentFromAgent(
                dependencies.db,
                runner,
                parsed.data,
                avatar
            );
            for (const event of created.events) {
                emitDurableChatEvent({ audienceUserId: null, event });
            }
            const configure = created.configure;
            if (configure) {
                void dependencies.postCommitWork.run('agent.configure-after-agent-create', () =>
                    dependencies.agentDelivery.configureAgent(configure)
                );
            }
            emitServerUpdated({
                agentId: created.receipt.agent.agentId,
                scope: 'agent',
                serverId: runner.serverId,
            });
            return created.receipt;
        } catch (cause) {
            return sendAgentRouteFailure(reply, cause, parsed.data.target);
        }
    });

    app.post('/api/agent/agents/update', async (request, reply) => {
        const runner = await authorizeAgentRunner(dependencies.db, request);
        if (!runner) {
            return missingToken(reply);
        }
        const parsed = agentUpdateAgentInputSchema.safeParse(request.body);
        if (!parsed.success) {
            return sendAgentApiError(
                reply,
                400,
                'INVALID_ARG',
                describeInvalidAgentProfileWrite(parsed.error, 'The update request was invalid.')
            );
        }
        try {
            const agent = await updateAgentDescription(dependencies.db, runner, parsed.data);
            emitServerUpdated({
                agentId: agent.agentId,
                scope: 'agent',
                serverId: runner.serverId,
            });
            return { agent };
        } catch (cause) {
            return sendAgentRouteFailure(reply, cause, null);
        }
    });

    app.post('/api/agent/agents/avatar', async (request, reply) => {
        const runner = await authorizeAgentRunner(dependencies.db, request);
        if (!runner) {
            return missingToken(reply);
        }
        const parsed = agentSetAgentAvatarInputSchema.safeParse(request.body);
        if (!parsed.success) {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', 'The avatar request was invalid.');
        }
        try {
            // Resolve first: generation is a long, rate-limited provider call,
            // and an unknown or protected target should not consume one.
            await resolveEditableAgent(dependencies.db, runner.serverId, parsed.data.agent);
            const image = await dependencies.avatarImageService.generate({
                agentId: runner.agentId,
                concept: parsed.data.concept,
                serverId: runner.serverId,
            });
            const receipt = await setAgentAvatarFromAgent(dependencies.db, runner, {
                agent: parsed.data.agent,
                avatar: image,
            });
            emitServerUpdated({
                agentId: receipt.agent.agentId,
                scope: 'agent',
                serverId: runner.serverId,
            });
            return receipt;
        } catch (cause) {
            return sendAgentRouteFailure(reply, cause, null);
        }
    });
}

function missingToken(reply: Parameters<typeof sendAgentApiError>[0]): unknown {
    return sendAgentApiError(reply, 401, 'MISSING_TOKEN', 'A valid runner credential is required.');
}
