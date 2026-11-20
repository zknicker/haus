import type { MessageBody } from '@haus/api';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { workerTurnsTable } from '../postgres/schema.ts';

export async function readWorkerMessageBodies(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    messageIds: string[]
) {
    const bodies = new Map<string, MessageBody>();
    if (messageIds.length === 0) {
        return bodies;
    }
    const reportMessageId = sql<string>`${workerTurnsTable.outcome}->'report'->>'messageId'`;
    const reports = await db
        .select({
            messageId: reportMessageId,
            outcome: workerTurnsTable.outcome,
            turnId: workerTurnsTable.id,
            workerId: workerTurnsTable.workerId,
        })
        .from(workerTurnsTable)
        .where(and(eq(workerTurnsTable.serverId, serverId), inArray(reportMessageId, messageIds)));
    for (const report of reports) {
        if (report.outcome?.kind === 'report') {
            bodies.set(report.messageId, {
                kind: 'worker-report',
                outcome: report.outcome.report.outcome,
                turnId: report.turnId,
                workerId: report.workerId,
            });
        }
    }
    const followUpMessageId = sql<string>`follow_up.input->>'messageId'`;
    const followUps = await db
        .select({ messageId: followUpMessageId, workerId: workerTurnsTable.workerId })
        .from(workerTurnsTable)
        .innerJoin(
            sql`jsonb_array_elements(${workerTurnsTable.input}) as follow_up(input)`,
            sql`true`
        )
        .where(
            and(eq(workerTurnsTable.serverId, serverId), inArray(followUpMessageId, messageIds))
        );
    for (const followUp of followUps) {
        bodies.set(followUp.messageId, { kind: 'worker-follow-up', workerId: followUp.workerId });
    }
    return bodies;
}
