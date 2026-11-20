import { drivePushCloseInputSchema } from '@haus/api';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { artifactAccess } from '../artifacts/access.ts';
import type { ArtifactStorage } from '../artifacts/storage.ts';
import type { ArtifactThumbnails } from '../artifacts/thumbnails.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import { pushDelete } from '../drive/push/delete.ts';
import { type DrivePushOptions, pushPut } from '../drive/push/put.ts';
import { closePush } from '../drive/push/session.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import { sendArtifactError } from './artifact-errors.ts';
import { authorizeAgentRunner, sendAgentApiError } from './auth.ts';

export function registerAgentDrivePushRoutes(
    app: FastifyInstance,
    options: {
        agentDelivery: Pick<AgentDelivery, 'dispatchAgent' | 'enqueue'>;
        budget: number;
        db: HausDatabase;
        postCommitWork: Pick<ServerPostCommitWork, 'wakeAgents'>;
        storage: ArtifactStorage | null;
        thumbnails: ArtifactThumbnails | null;
    }
) {
    const push: DrivePushOptions = {
        agentDelivery: options.agentDelivery,
        budget: options.budget,
        db: options.db,
        storage: options.storage,
        thumbnails: options.thumbnails,
        wake: (wakes) => {
            if (wakes.length > 0) {
                void options.postCommitWork.wakeAgents(options.agentDelivery, wakes);
            }
        },
    };
    app.post(
        '/api/agent/drive/push/put',
        {
            // WARNING: read the raw stream in onRequest, before Fastify's body parser buffers it.
            onRequest: async (request, reply) =>
                await withRunner(options.db, request, reply, async (runner) =>
                    pushPut(push, runner, {
                        contentType: request.headers['content-type'],
                        query: request.query,
                        stream: request.raw,
                    })
                ),
        },
        async (_request, reply) => reply
    );
    app.post(
        '/api/agent/drive/push/delete',
        async (request, reply) =>
            await withRunner(options.db, request, reply, async (runner) =>
                pushDelete(push, runner, request.body ?? {})
            )
    );
    app.post(
        '/api/agent/drive/push/close',
        async (request, reply) =>
            await withRunner(options.db, request, reply, async (runner) => {
                const input = drivePushCloseInputSchema.parse(request.body ?? {});
                const access = await artifactAccess(options.db, { kind: 'agent', runner });
                const closed = await closePush(
                    options.db,
                    options.agentDelivery,
                    access,
                    input.push_id
                );
                push.wake(closed.wakes);
                return { listed: closed.listed };
            })
    );
}

async function withRunner(
    db: HausDatabase,
    request: FastifyRequest,
    reply: FastifyReply,
    run: (runner: ResolvedRunner) => Promise<unknown>
) {
    try {
        const runner = await authorizeAgentRunner(db, request);
        if (!runner) {
            return await sendAgentApiError(
                reply,
                401,
                'MISSING_TOKEN',
                'A valid runner credential is required.'
            );
        }
        return await reply.send(await run(runner));
    } catch (cause) {
        return await sendArtifactError(reply, cause);
    }
}
