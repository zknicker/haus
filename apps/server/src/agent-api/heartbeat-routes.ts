import {
    heartbeatLearnedInputSchema,
    heartbeatLearnedResponseSchema,
    heartbeatReportInputSchema,
    heartbeatReportResponseSchema,
    leadClaimInputSchema,
    leadDoneInputSchema,
} from '@haus/api';
import type { FastifyInstance, FastifyReply } from 'fastify';
import * as z from 'zod';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { saveDreamLearned } from '../heartbeat/dream-summary.ts';
import { HeartbeatRefusedError, LeadNotFoundError } from '../heartbeat/heartbeat-errors.ts';
import { fileHeartbeatReport } from '../heartbeat/heartbeat-report.ts';
import { claimLead, finishLead, listLeads } from '../heartbeat/leads.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import { authorizeAgentRunner, sendAgentApiError } from './auth.ts';
import { AgentTargetError } from './resolve-target.ts';

const idParamsSchema = z.object({ id: z.string().min(1).max(200) });

/**
 * The heartbeat surface of a run: its one report, the nightly "learned" summary, and the
 * Server's shared leads. Every route resolves the Agent, Server and run from the runner token.
 */
export function registerAgentHeartbeatRoutes(
    app: FastifyInstance,
    options: {
        agentDelivery: AgentDelivery;
        db: HausDatabase;
        postCommitWork: ServerPostCommitWork;
    }
) {
    const { agentDelivery, db, postCommitWork } = options;

    app.post('/api/agent/heartbeat/report', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        if (!runner) {
            return unauthorized(reply);
        }
        const body = heartbeatReportInputSchema.safeParse(request.body);
        if (!body.success) {
            return invalid(reply, 'The heartbeat report needs text of 1 to 4000 characters.');
        }
        return await runAction(reply, async () => {
            const filed = await fileHeartbeatReport(db, agentDelivery, runner, body.data.text);
            void postCommitWork.run('heartbeat.report.dispatch', () =>
                agentDelivery.dispatchAgent(runner.agentId, runner.serverId)
            );
            return heartbeatReportResponseSchema.parse(filed);
        });
    });

    app.post('/api/agent/heartbeat/learned', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        if (!runner) {
            return unauthorized(reply);
        }
        const body = heartbeatLearnedInputSchema.safeParse(request.body);
        if (!body.success) {
            return invalid(reply, 'What you learned needs text of 1 to 2000 characters.');
        }
        return await runAction(reply, async () =>
            heartbeatLearnedResponseSchema.parse(await saveDreamLearned(db, runner, body.data.text))
        );
    });

    app.post('/api/agent/leads', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        if (!runner) {
            return unauthorized(reply);
        }
        const body = leadClaimInputSchema.safeParse(request.body);
        if (!body.success) {
            return invalid(reply, 'A lead needs a topic of 1 to 200 characters.');
        }
        return await runAction(reply, () => claimLead(db, runner, body.data));
    });

    app.get('/api/agent/leads', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        if (!runner) {
            return unauthorized(reply);
        }
        return await runAction(reply, () => listLeads(db, runner));
    });

    app.post('/api/agent/leads/:id/done', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        if (!runner) {
            return unauthorized(reply);
        }
        const params = idParamsSchema.safeParse(request.params);
        const body = leadDoneInputSchema.safeParse(request.body);
        if (!(params.success && body.success)) {
            return invalid(
                reply,
                'A finished lead needs an id and a finding of 1 to 1000 characters.'
            );
        }
        return await runAction(reply, () =>
            finishLead(db, runner, { finding: body.data.finding, id: params.data.id })
        );
    });
}

async function runAction(reply: FastifyReply, action: () => Promise<unknown>) {
    try {
        return await action();
    } catch (cause) {
        if (cause instanceof HeartbeatRefusedError) {
            return sendAgentApiError(reply, cause.status, cause.code, cause.message);
        }
        if (cause instanceof LeadNotFoundError || cause instanceof AgentTargetError) {
            return sendAgentApiError(reply, 404, 'INVALID_TARGET', cause.message);
        }
        throw cause;
    }
}

function unauthorized(reply: FastifyReply) {
    return sendAgentApiError(reply, 401, 'MISSING_TOKEN', 'A valid runner credential is required.');
}

function invalid(reply: FastifyReply, message: string) {
    return sendAgentApiError(reply, 400, 'INVALID_ARG', message);
}
