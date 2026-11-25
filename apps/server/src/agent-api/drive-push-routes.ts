import { drivePushCloseInputSchema } from '@haus/api';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { confirmFlush } from '../agent-machine/machine-change-store.ts';
import { type ArtifactActor, artifactAccess } from '../artifacts/access.ts';
import type { ArtifactStorage } from '../artifacts/storage.ts';
import type { ArtifactThumbnails } from '../artifacts/thumbnails.ts';
import { pushDelete } from '../drive/push/delete.ts';
import { type DrivePushOptions, pushPut } from '../drive/push/put.ts';
import { closePush } from '../drive/push/session.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import { sendArtifactError } from './artifact-errors.ts';
import { sendAgentApiError } from './auth.ts';
import { authorizeDrivePusher } from './worker-auth.ts';

export function registerAgentDrivePushRoutes(
    app: FastifyInstance,
    options: {
        agentDelivery: Pick<AgentDelivery, 'advanceMachineChange' | 'dispatchAgent' | 'enqueue'>;
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
                await withRunner(options.db, request, reply, async (actor) =>
                    pushPut(push, actor, {
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
            await withRunner(options.db, request, reply, async (actor) =>
                pushDelete(push, actor, request.body ?? {})
            )
    );
    app.post(
        '/api/agent/drive/push/close',
        async (request, reply) =>
            await withRunner(options.db, request, reply, async (actor) => {
                const input = drivePushCloseInputSchema.parse(request.body ?? {});
                const access = await artifactAccess(options.db, actor);
                const closed = await closePush(
                    options.db,
                    options.agentDelivery,
                    access,
                    input.push_id,
                    access.worker ? (input.unsent ?? []) : []
                );
                push.wake(closed.wakes);
                if (
                    access.agentId &&
                    !access.worker &&
                    (await confirmFlush(options.db, {
                        agentId: access.agentId,
                        pushId: input.push_id,
                        serverId: access.serverId,
                    }))
                ) {
                    await options.agentDelivery.advanceMachineChange(access.agentId);
                }
                return { listed: closed.listed };
            })
    );
}

async function withRunner(
    db: HausDatabase,
    request: FastifyRequest,
    reply: FastifyReply,
    run: (actor: ArtifactActor) => Promise<unknown>
) {
    try {
        const actor = await authorizeDrivePusher(db, request);
        if (!actor) {
            return await sendAgentApiError(
                reply,
                401,
                'MISSING_TOKEN',
                'A valid runner credential is required.'
            );
        }
        return await reply.send(await run(actor));
    } catch (cause) {
        return await sendArtifactError(reply, cause);
    }
}
