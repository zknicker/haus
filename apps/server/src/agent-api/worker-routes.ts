import {
    agentWorkerListInputSchema,
    agentWorkerSendInputSchema,
    agentWorkerStartInputSchema,
    agentWorkerStopInputSchema,
    workerPlacesInputSchema,
} from '@haus/api';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { announceRunEngagements } from '../agent-delivery/chat-engagement-events.ts';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { ArtifactStorage } from '../artifacts/storage.ts';
import type { ComputerConnections } from '../computers/connections.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import { listAgentWorker } from '../workers/list-agent-worker.ts';
import { listWorkerPlaces } from '../workers/list-worker-places.ts';
import { startWorker } from '../workers/start-worker.ts';
import { commitWorkerEffects } from '../workers/worker-effects.ts';
import { sendAgentFollowUp, stopAgentWorker } from '../workers/worker-operations.ts';
import { authorizeAgentRunner, sendAgentApiError } from './auth.ts';
import { sendWorkerFailure } from './worker-failures.ts';

/**
 * The Agent-scoped Worker routes behind `haus worker`. The Server records the
 * Worker and its turns, then dispatches turns to their carrier; it never
 * reaches a provider itself.
 */
export function registerAgentWorkerRoutes(
    app: FastifyInstance,
    dependencies: {
        agentDelivery: AgentDelivery;
        appOrigin: string;
        computers: ComputerConnections;
        db: HausDatabase;
        postCommitWork: ServerPostCommitWork;
        storage: ArtifactStorage | null;
    }
) {
    const { db, storage } = dependencies;
    const sinks = {
        agentDelivery: dependencies.agentDelivery,
        connections: dependencies.computers,
        postCommitWork: dependencies.postCommitWork,
    };
    const route = <Schema extends z.ZodType>(
        schema: Schema,
        read: (request: FastifyRequest) => unknown,
        handle: (runner: ResolvedRunner, input: z.output<Schema>) => Promise<unknown>
    ) => {
        return async (request: FastifyRequest, reply: FastifyReply) => {
            const runner = await authorizeAgentRunner(db, request);
            if (!runner) {
                return sendAgentApiError(
                    reply,
                    401,
                    'MISSING_TOKEN',
                    'A valid runner credential is required.'
                );
            }
            const parsed = schema.safeParse(read(request));
            if (!parsed.success) {
                return sendAgentApiError(
                    reply,
                    400,
                    'INVALID_ARG',
                    'The Worker request was invalid.'
                );
            }
            try {
                return await handle(runner, parsed.data);
            } catch (cause) {
                return sendWorkerFailure(reply, cause, dependencies.appOrigin);
            }
        };
    };

    app.get(
        '/api/agent/workers',
        route(
            agentWorkerListInputSchema,
            (request) => request.query,
            async (runner, input) => ({
                workers: await listAgentWorker(db, runner, input.workerId),
            })
        )
    );
    app.get(
        '/api/agent/workers/places',
        route(
            workerPlacesInputSchema,
            (request) => request.query,
            async (runner, input) => await listWorkerPlaces(db, runner, input.task)
        )
    );
    app.post(
        '/api/agent/workers',
        route(
            agentWorkerStartInputSchema,
            (request) => request.body,
            async (runner, input) => {
                const started = await startWorker(db, runner, input, storage);
                if (started.kind === 'held') {
                    void dependencies.postCommitWork.run('chat.engagement.announce', () =>
                        announceRunEngagements(db, runner)
                    );
                    return started.held;
                }
                await commitWorkerEffects(started.effects, sinks);
                return started.receipt;
            }
        )
    );
    app.post(
        '/api/agent/workers/send',
        route(
            agentWorkerSendInputSchema,
            (request) => request.body,
            async (runner, input) => {
                const sent = await sendAgentFollowUp(db, runner, input, storage);
                await commitWorkerEffects(sent.effects, sinks);
                return sent.receipt;
            }
        )
    );
    app.post(
        '/api/agent/workers/stop',
        route(
            agentWorkerStopInputSchema,
            (request) => request.body,
            async (runner, input) => {
                const stopped = await stopAgentWorker(db, runner, input.workerId, storage);
                await commitWorkerEffects(stopped.effects, sinks);
                return { worker: stopped.worker };
            }
        )
    );
}
