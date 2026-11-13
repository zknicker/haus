import { agentClaimCreateInputSchema } from '@haus/api';
import type { FastifyInstance } from 'fastify';
import * as z from 'zod';
import { publishCommittedAgentActivity } from '../agent-delivery/activity-events.ts';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { isHeartbeatRun } from '../heartbeat/run-source.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { publishRealtime } from '../realtime/topic.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import { authorizeAgentRunner, sendAgentApiError, sendAgentReadError } from './auth.ts';
import { assignAgentClaim } from './claim-assign.ts';
import { claimAgentClaims } from './claim-claim.ts';
import { createAgentClaims } from './claim-create.ts';
import { CLAIM_LIST_STATUSES, listAgentClaims } from './claim-list.ts';
import { releaseAgentClaim, updateAgentClaim } from './claims.ts';

const claimStatusSchema = z.enum(['todo', 'in_progress', 'in_review', 'done', 'closed']);

export function registerAgentClaimRoutes(
    app: FastifyInstance,
    options: {
        agentDelivery: AgentDelivery;
        db: HausDatabase;
        postCommitWork: ServerPostCommitWork;
    }
) {
    const { agentDelivery, db, postCommitWork } = options;
    app.get('/api/agent/claims', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        const parsed = z
            .object({
                mine: z.enum(['true', 'false']).optional(),
                status: z.enum(CLAIM_LIST_STATUSES).optional(),
                target: z.string().optional(),
            })
            .safeParse(request.query);
        if (!(runner && parsed.success)) {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', 'The claim request was invalid.');
        }
        try {
            return await listAgentClaims(db, runner, {
                ...parsed.data,
                mine: parsed.data.mine === 'true',
            });
        } catch (cause) {
            return sendAgentReadError(reply, cause);
        }
    });

    app.post('/api/agent/claims/create', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        const parsed = agentClaimCreateInputSchema.safeParse(request.body);
        if (!(runner && parsed.success)) {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', 'The claim request was invalid.');
        }
        try {
            const result = await createAgentClaims(db, runner, parsed.data, agentDelivery);
            for (const activity of result.activities) {
                publishCommittedAgentActivity(activity);
            }
            publishRealtime(result.events);
            await postCommitWork.wakeAgents(agentDelivery, result.wakes);
            return { claims: result.claims };
        } catch (cause) {
            return sendAgentReadError(reply, cause);
        }
    });

    app.post('/api/agent/claims/claim', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        const parsed = z
            .object({
                messageId: z.string().optional(),
                numbers: z.array(z.number().int().positive()).max(20).optional(),
                target: z.string().min(1),
            })
            .safeParse(request.body);
        if (!(runner && parsed.success)) {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', 'The claim request was invalid.');
        }
        // A heartbeat's throwaway session cannot follow replies or finish a tracked claim.
        if (await isHeartbeatRun(db, runner)) {
            return sendAgentApiError(
                reply,
                403,
                'REGULAR_TURN_REQUIRED',
                'haus claim does not work in a heartbeat run. Use haus lead claim.'
            );
        }
        try {
            const result = await claimAgentClaims(db, runner, parsed.data);
            publishRealtime(result.events);
            return { results: result.results };
        } catch (cause) {
            return sendAgentReadError(reply, cause);
        }
    });

    for (const action of ['assign', 'unassign'] as const) {
        app.post(`/api/agent/claims/${action}`, async (request, reply) => {
            const runner = await authorizeAgentRunner(db, request);
            const parsed = z
                .object({
                    assignee: z.string().min(1).optional(),
                    expectedRevision: z.number().int().nonnegative().optional(),
                    number: z.number().int().positive(),
                    target: z.string().min(1),
                })
                .safeParse(request.body);
            const assignee = parsed.success ? (parsed.data.assignee ?? null) : null;
            if (!(runner && parsed.success) || (action === 'assign') !== (assignee !== null)) {
                return sendAgentApiError(
                    reply,
                    400,
                    'INVALID_ARG',
                    'The claim request was invalid.'
                );
            }
            try {
                const result = await assignAgentClaim(db, runner, agentDelivery, {
                    ...parsed.data,
                    assignee,
                });
                publishRealtime(result.events);
                await postCommitWork.wakeAgents(
                    agentDelivery,
                    result.wakes.map((agentId) => ({ agentId, serverId: runner.serverId }))
                );
                return { claim: result.claim };
            } catch (cause) {
                return sendAgentReadError(reply, cause);
            }
        });
    }

    for (const action of ['release', 'update'] as const) {
        app.post(`/api/agent/claims/${action}`, async (request, reply) => {
            const runner = await authorizeAgentRunner(db, request);
            const parsed = z
                .object({
                    number: z.number().int().positive(),
                    status: claimStatusSchema.optional(),
                    target: z.string().min(1),
                })
                .safeParse(request.body);
            if (!(runner && parsed.success) || (action === 'update' && !parsed.data.status)) {
                return sendAgentApiError(
                    reply,
                    400,
                    'INVALID_ARG',
                    'The claim request was invalid.'
                );
            }
            try {
                const result =
                    action === 'release'
                        ? await releaseAgentClaim(db, runner, parsed.data)
                        : await updateAgentClaim(db, runner, {
                              ...parsed.data,
                              status: parsed.data.status as z.infer<typeof claimStatusSchema>,
                          });
                if (result.event) {
                    publishRealtime(result.event);
                }
                return { claim: result.claim };
            } catch (cause) {
                return sendAgentReadError(reply, cause);
            }
        });
    }
}
