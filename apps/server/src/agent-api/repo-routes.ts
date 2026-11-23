import type { FastifyInstance } from 'fastify';
import type { HausDatabase } from '../postgres/connection.ts';
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
}
