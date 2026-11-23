import type { FastifyInstance } from 'fastify';
import type { ComputerConnections } from '../computers/connections.ts';
import { listAgentComputers } from '../computers/list-agent-computers.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { authorizeAgentRunner, sendAgentApiError } from './auth.ts';

/** The Agent-scoped Computer route behind `haus computer list`. */
export function registerAgentComputerRoutes(
    app: FastifyInstance,
    dependencies: { computers: Pick<ComputerConnections, 'isOnline'>; db: HausDatabase }
) {
    const { computers, db } = dependencies;
    app.get('/api/agent/computers', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        if (!runner) {
            return sendAgentApiError(
                reply,
                401,
                'MISSING_TOKEN',
                'A valid runner credential is required.'
            );
        }
        return await listAgentComputers(db, computers, runner);
    });
}
