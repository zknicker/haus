import {
    type ManualMissGuidance,
    manualGetMissGuidance,
    manualSearchMissGuidance,
    resolveManualTopic,
    searchManualTopics,
} from '@haus/agent-manual';
import {
    agentManualGetQuerySchema,
    agentManualGetResponseSchema,
    agentManualSearchQuerySchema,
    agentManualSearchResponseSchema,
    manualRunnerCapability,
} from '@haus/api';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type * as z from 'zod';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { agentManualLookupAuditTable } from '../postgres/schema.ts';
import { authorizeAgentRunner, sendAgentApiError } from './auth.ts';

/** A lookup that found nothing; carries the closest-topic recovery copy. */
export class ManualLookupMissError extends Error {
    constructor(
        readonly code: 'MANUAL_NO_MATCH' | 'MANUAL_TOPIC_NOT_FOUND',
        readonly guidance: ManualMissGuidance
    ) {
        super(guidance.message);
        this.name = 'ManualLookupMissError';
    }
}

export function registerAgentManualRoutes(app: FastifyInstance, db: HausDatabase) {
    app.get('/api/agent/manual/get', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        if (!runner) {
            return sendAgentApiError(
                reply,
                401,
                'MISSING_TOKEN',
                'A valid runner credential is required.'
            );
        }
        if (!runner.capabilities.includes(manualRunnerCapability)) {
            return sendAgentApiError(
                reply,
                403,
                'MANUAL_CAPABILITY_REQUIRED',
                'This runner is not authorized to read the Haus Manual.'
            );
        }
        const parsed = agentManualGetQuerySchema.safeParse(request.query);
        if (!parsed.success) {
            return sendAgentApiError(
                reply,
                400,
                'MANUAL_INVALID_METADATA',
                'Manual intent and reason must each be 12–500 characters.'
            );
        }
        try {
            return await readManualTopic(db, runner, parsed.data);
        } catch (cause) {
            if (cause instanceof ManualLookupMissError) {
                return sendManualMiss(reply, cause);
            }
            return sendAgentApiError(
                reply,
                500,
                'SERVER_5XX',
                'The Server could not read the Manual.'
            );
        }
    });

    app.get('/api/agent/manual/search', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        if (!runner) {
            return sendAgentApiError(
                reply,
                401,
                'MISSING_TOKEN',
                'A valid runner credential is required.'
            );
        }
        if (!runner.capabilities.includes(manualRunnerCapability)) {
            return sendAgentApiError(
                reply,
                403,
                'MANUAL_CAPABILITY_REQUIRED',
                'This runner is not authorized to read the Haus Manual.'
            );
        }
        const parsed = agentManualSearchQuerySchema.safeParse(request.query);
        if (!parsed.success) {
            return sendAgentApiError(
                reply,
                400,
                'MANUAL_INVALID_METADATA',
                'Manual intent and reason must each be 12–500 characters.'
            );
        }
        try {
            return await searchManual(db, runner, parsed.data);
        } catch (cause) {
            if (cause instanceof ManualLookupMissError) {
                return sendManualMiss(reply, cause);
            }
            return sendAgentApiError(
                reply,
                500,
                'SERVER_5XX',
                'The Server could not read the Manual.'
            );
        }
    });
}

async function readManualTopic(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: z.infer<typeof agentManualGetQuerySchema>
) {
    await recordManualLookup(db, runner, {
        intent: input.intent,
        operation: 'get',
        reason: input.reason,
        topicId: input.topic,
    });
    const resolved = resolveManualTopic(input.topic);
    if (!resolved) {
        throw new ManualLookupMissError(
            'MANUAL_TOPIC_NOT_FOUND',
            manualGetMissGuidance(input.topic)
        );
    }
    // Aliases steer server-side lookup only; they are not part of the wire topic.
    const { aliases: _aliases, ...topic } = resolved;
    return agentManualGetResponseSchema.parse({ topic });
}

async function searchManual(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: z.infer<typeof agentManualSearchQuerySchema>
) {
    await recordManualLookup(db, runner, {
        intent: input.intent,
        operation: 'search',
        query: input.q,
        reason: input.reason,
    });
    const results = searchManualTopics(input.q, { limit: input.limit, scope: input.scope }).map(
        ({ aliases: _aliases, body: _body, related: _related, ...result }) => result
    );
    if (results.length === 0) {
        throw new ManualLookupMissError(
            'MANUAL_NO_MATCH',
            manualSearchMissGuidance(input.q, input.scope)
        );
    }
    return agentManualSearchResponseSchema.parse({
        query: input.q,
        results,
        scope: input.scope,
    });
}

function sendManualMiss(reply: FastifyReply, miss: ManualLookupMissError) {
    return sendAgentApiError(reply, 404, miss.code, miss.guidance.message, {
        nextAction: miss.guidance.nextAction,
    });
}

async function recordManualLookup(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: {
        intent: string;
        operation: 'get' | 'search';
        query?: string;
        reason: string;
        topicId?: string;
    }
) {
    await db.insert(agentManualLookupAuditTable).values({
        agentId: runner.agentId,
        id: createOpaqueId('aml'),
        intent: input.intent,
        operation: input.operation,
        query: input.query ?? null,
        reason: input.reason,
        runId: runner.runId,
        runnerId: runner.runnerId,
        serverId: runner.serverId,
        topicId: input.topicId ?? null,
    });
}
