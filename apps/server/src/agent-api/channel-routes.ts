import { agentAddChannelAgentInputSchema, agentCreateChannelInputSchema } from '@haus/api';
import type { FastifyInstance } from 'fastify';
import * as z from 'zod';
import { findLiveChannel } from '../chats/channel-agent-membership.ts';
import { ChannelNameTakenError } from '../chats/create-channel.ts';
import { prepareLifecycleEvent } from '../chats/lifecycle-events.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { publishRealtime } from '../realtime/topic.ts';
import { AgentIdentityProtectedError } from '../server-agents/errors.ts';
import { changeAgentChannelMute } from './attention.ts';
import { authorizeAgentRunner, sendAgentApiError, sendAgentReadError } from './auth.ts';
import { createAgentChannel } from './channel-create.ts';
import { addAgentToChannel } from './channel-membership.ts';
import {
    changeAgentChannelMembership,
    readAgentChannelInfo,
    readAgentChannelMembers,
} from './directory.ts';

const targetSchema = z.object({ target: z.string().trim().min(1).max(200) });

/** The channel surface an Agent drives: creating one, what a channel is, who is in it, and membership. */
export function registerAgentChannelRoutes(app: FastifyInstance, options: { db: HausDatabase }) {
    const { db } = options;

    app.get('/api/agent/channels/info', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        const parsed = targetSchema.safeParse(request.query);
        if (!(runner && parsed.success)) {
            return invalidChannelRequest(reply);
        }
        try {
            return await readAgentChannelInfo(db, runner, parsed.data.target);
        } catch (cause) {
            return sendAgentReadError(reply, cause);
        }
    });

    app.get('/api/agent/channels/members', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        const parsed = targetSchema.safeParse(request.query);
        if (!(runner && parsed.success)) {
            return invalidChannelRequest(reply);
        }
        try {
            return await readAgentChannelMembers(db, runner, parsed.data.target);
        } catch (cause) {
            return sendAgentReadError(reply, cause);
        }
    });

    app.post('/api/agent/channels/create', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        if (!runner) {
            return invalidChannelRequest(reply);
        }
        const parsed = agentCreateChannelInputSchema.safeParse(request.body);
        if (!parsed.success) {
            const message = parsed.error.issues[0]?.message ?? 'The channel request was invalid.';
            return sendAgentApiError(reply, 400, 'INVALID_ARG', message);
        }
        try {
            const created = await createAgentChannel(db, runner, parsed.data);
            publishRealtime(created.event);
            return created.receipt;
        } catch (cause) {
            if (cause instanceof ChannelNameTakenError) {
                return sendAgentApiError(reply, 409, 'CHANNEL_NAME_TAKEN', cause.message, {
                    nextAction: `Run haus server info --channels --query ${parsed.data.name} to find it, then haus channel join --target "#${parsed.data.name}" if it is open.`,
                });
            }
            return sendAgentReadError(reply, cause);
        }
    });

    app.post('/api/agent/channels/add', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        const parsed = agentAddChannelAgentInputSchema.safeParse(request.body);
        if (!(runner && parsed.success)) {
            return invalidChannelRequest(reply);
        }
        try {
            const receipt = await addAgentToChannel(db, runner, parsed.data);
            if (receipt.added) {
                await announceChannelMembership(db, runner.serverId, receipt.target);
            }
            return receipt;
        } catch (cause) {
            if (cause instanceof AgentIdentityProtectedError) {
                return sendAgentApiError(reply, 403, 'AGENT_IDENTITY_PROTECTED', cause.message);
            }
            return sendAgentReadError(reply, cause);
        }
    });

    for (const action of ['join', 'leave'] as const) {
        app.post(`/api/agent/channels/${action}`, async (request, reply) => {
            const runner = await authorizeAgentRunner(db, request);
            const parsed = targetSchema.safeParse(request.body);
            if (!(runner && parsed.success)) {
                return invalidChannelRequest(reply);
            }
            try {
                const changed = await changeAgentChannelMembership(
                    db,
                    runner,
                    parsed.data.target,
                    action
                );
                await announceChannelMembership(db, runner.serverId, changed.target);
                return changed;
            } catch (cause) {
                return sendAgentReadError(reply, cause);
            }
        });
    }

    for (const action of ['mute', 'unmute'] as const) {
        app.post(`/api/agent/channels/${action}`, async (request, reply) => {
            const runner = await authorizeAgentRunner(db, request);
            const parsed = targetSchema.safeParse(request.body);
            if (!(runner && parsed.success)) {
                return invalidChannelRequest(reply);
            }
            try {
                return await changeAgentChannelMute(
                    db,
                    runner,
                    parsed.data.target,
                    action === 'mute'
                );
            } catch (cause) {
                return sendAgentReadError(reply, cause);
            }
        });
    }
}

/**
 * Membership is what the App reads off a channel, so an Agent joining, leaving,
 * or being added announces itself exactly as a human's channel save does.
 */
async function announceChannelMembership(db: HausDatabase, serverId: string, target: string) {
    const channel = await findLiveChannel(db, serverId, target);
    if (!channel) {
        return;
    }
    publishRealtime(prepareLifecycleEvent({ chatId: channel.id, serverId }, 'updated'));
}

function invalidChannelRequest(reply: Parameters<typeof sendAgentApiError>[0]): unknown {
    return sendAgentApiError(reply, 400, 'INVALID_ARG', 'The channel request was invalid.');
}
