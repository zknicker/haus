import { agentCoAuthorInputSchema } from '@haus/api';
import type { FastifyInstance } from 'fastify';
import type { HausDatabase } from '../postgres/connection.ts';
import { readCoAuthors } from '../repos/co-authors.ts';
import { listServerRepos } from '../repos/repo-folder-read.ts';
import { authorizeAgentRunner, sendAgentApiError } from './auth.ts';

export function registerAgentRepoRoutes(app: FastifyInstance, db: HausDatabase) {
    app.get('/api/agent/repos', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        if (!runner) {
            return sendAgentApiError(
                reply,
                401,
                'MISSING_TOKEN',
                'A valid runner credential is required.'
            );
        }
        return await listServerRepos(db, runner.serverId);
    });

    app.post('/api/agent/repos/co-authors', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        if (!runner) {
            return sendAgentApiError(
                reply,
                401,
                'MISSING_TOKEN',
                'A valid runner credential is required.'
            );
        }
        const input = agentCoAuthorInputSchema.safeParse(request.body);
        if (!input.success) {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', 'Name 1 to 20 people by handle.');
        }
        return await readCoAuthors(db, runner.serverId, input.data.people);
    });
}
