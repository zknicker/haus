import { agentSelfProfileUpdateInputSchema } from '@haus/api';
import type { FastifyInstance } from 'fastify';
import * as z from 'zod';
import { emitServerUpdated } from '../haus-api/server-events.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { AgentConfigDeniedError } from '../server-agents/agent-config-errors.ts';
import { AgentDescriptionTooLongError } from '../server-agents/errors.ts';
import { authorizeAgentRunner, sendAgentApiError, sendAgentReadError } from './auth.ts';
import {
    agentDescriptionTooLongRefusal,
    describeInvalidAgentProfileWrite,
} from './description-invalid.ts';
import { readAgentProfile, updateAgentProfile } from './profile.ts';

/**
 * `haus profile show` and `haus profile update`. The runner token fixes the Agent, so an update
 * only ever changes the caller; its conversation style is readable only on its own profile.
 */
export function registerAgentProfileRoutes(app: FastifyInstance, db: HausDatabase) {
    app.get('/api/agent/profile', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        const parsed = z.object({ target: z.string().optional() }).safeParse(request.query);
        if (!(runner && parsed.success)) {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', 'The profile request was invalid.');
        }
        try {
            return await readAgentProfile(db, runner, parsed.data.target);
        } catch (cause) {
            return sendAgentReadError(reply, cause);
        }
    });

    app.post('/api/agent/profile/update', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        const parsed = agentSelfProfileUpdateInputSchema.safeParse(request.body);
        if (!(runner && parsed.success)) {
            return sendAgentApiError(
                reply,
                400,
                'INVALID_ARG',
                parsed.success
                    ? 'The profile request was invalid.'
                    : describeInvalidAgentProfileWrite(
                          parsed.error,
                          'The profile request was invalid.'
                      )
            );
        }
        try {
            const updated = await updateAgentProfile(db, runner, parsed.data);
            emitServerUpdated({
                agentId: runner.agentId,
                scope: 'agent',
                serverId: runner.serverId,
            });
            return updated;
        } catch (cause) {
            if (cause instanceof AgentDescriptionTooLongError) {
                return sendAgentApiError(reply, 400, 'INVALID_ARG', agentDescriptionTooLongRefusal);
            }
            if (cause instanceof AgentConfigDeniedError) {
                return sendAgentApiError(reply, 403, 'AGENT_IDENTITY_PROTECTED', cause.message);
            }
            return sendAgentReadError(reply, cause);
        }
    });
}
