import { agentManagedSkillNoticeAckSchema } from '@haus/api';
import type { FastifyInstance } from 'fastify';
import { ackManagedSkillNotice, readManagedSkillNotice } from '../managed-skills/notice.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { authorizeAgentRunner, sendAgentApiError } from './auth.ts';

export function registerAgentManagedSkillRoutes(app: FastifyInstance, db: HausDatabase) {
    app.get('/api/agent/managed-skills/notice', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        if (!runner) {
            return missingToken(reply);
        }
        return await readManagedSkillNotice(db, runner);
    });

    app.post('/api/agent/managed-skills/notice/ack', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        if (!runner) {
            return missingToken(reply);
        }
        const parsed = agentManagedSkillNoticeAckSchema.safeParse(request.body);
        if (!parsed.success) {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', 'The notice receipt was invalid.');
        }
        await ackManagedSkillNotice(db, runner, parsed.data.announced);
        return { ok: true };
    });
}

function missingToken(reply: Parameters<typeof sendAgentApiError>[0]) {
    return sendAgentApiError(reply, 401, 'MISSING_TOKEN', 'A valid runner credential is required.');
}
