import { workerReportInputSchema } from '@haus/api';
import { and, eq, isNotNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { HausDatabase } from '../postgres/connection.ts';
import { workerTurnsTable } from '../postgres/schema.ts';
import { WorkerTurnSettledError } from '../workers/place-errors.ts';
import { recordWorkerReport } from '../workers/record-worker-report.ts';
import { sendAgentApiError } from './auth.ts';
import { authorizeWorkerTurn } from './worker-auth.ts';
import { sendWorkerFailure } from './worker-failures.ts';

export function registerWorkerReportRoute(app: FastifyInstance, options: { db: HausDatabase }) {
    const { db } = options;
    app.post('/api/worker/report', async (request, reply) => {
        const scope = await authorizeWorkerTurn(db, request);
        if (!scope) {
            return sendAgentApiError(
                reply,
                401,
                'MISSING_TOKEN',
                'A valid Worker turn credential is required.'
            );
        }
        if (!scope.live) {
            return (await isSettled(db, scope))
                ? sendWorkerFailure(reply, new WorkerTurnSettledError())
                : sendAgentApiError(
                      reply,
                      401,
                      'MISSING_TOKEN',
                      'This turn credential was replaced.'
                  );
        }
        const parsed = workerReportInputSchema.safeParse(request.body);
        if (!parsed.success) {
            return sendAgentApiError(
                reply,
                400,
                'INVALID_ARG',
                parsed.error.issues[0]?.message ?? 'The report was invalid.'
            );
        }
        try {
            return await recordWorkerReport(db, scope, parsed.data);
        } catch (cause) {
            return sendWorkerFailure(reply, cause);
        }
    });
}

async function isSettled(db: HausDatabase, scope: { serverId: string; turnId: string }) {
    const [turn] = await db
        .select({ id: workerTurnsTable.id })
        .from(workerTurnsTable)
        .where(
            and(
                eq(workerTurnsTable.serverId, scope.serverId),
                eq(workerTurnsTable.id, scope.turnId),
                isNotNull(workerTurnsTable.outcome)
            )
        )
        .limit(1);
    return turn !== undefined;
}
