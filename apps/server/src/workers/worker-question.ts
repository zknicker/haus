import { type WorkerQuestionsClosed, type WorkerTurnInput, workerQuestionOf } from '@haus/api';
import { and, desc, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    serverMembershipsTable,
    workerTurnsTable,
    type workersTable,
} from '../postgres/schema.ts';
import { WorkerClosedError, WorkerQuestionClosedError } from './errors.ts';

type WorkerRow = typeof workersTable.$inferSelect;
type TurnRow = typeof workerTurnsTable.$inferSelect;

export async function readWorkerQuestion(tx: Pick<HausDatabase, 'select'>, worker: WorkerRow) {
    const [newest] = await tx
        .select()
        .from(workerTurnsTable)
        .where(
            and(
                eq(workerTurnsTable.serverId, worker.serverId),
                eq(workerTurnsTable.workerId, worker.id)
            )
        )
        .orderBy(desc(workerTurnsTable.createdAt), desc(workerTurnsTable.id))
        .limit(1);
    const question = newest
        ? workerQuestionOf({
              closedAt: worker.closedAt?.toISOString() ?? null,
              closingAt: worker.closingAt?.toISOString() ?? null,
              turns: [{ outcome: newest.outcome, turnId: newest.id }],
          })
        : null;
    return { newest: newest ?? null, question };
}

/** The open questions `turnId` asked, or the refusal that says who closed them first. */
export async function requireOpenQuestion(
    tx: Pick<HausDatabase, 'select'>,
    worker: WorkerRow,
    turnId: string
) {
    const { newest, question } = await readWorkerQuestion(tx, worker);
    if (worker.closingAt || worker.closedAt) {
        throw new WorkerClosedError();
    }
    if (newest && question?.turnId === turnId) {
        if (question.open) {
            return newest;
        }
        const who = question.closed ? await nameOf(tx, worker.serverId, question.closed.by) : null;
        throw new WorkerQuestionClosedError(
            question.closed?.reason === 'stopped'
                ? `${who ?? 'Someone'} stopped the Worker, which closed these questions.`
                : `Dismissed by ${who ?? 'someone'}.`
        );
    }
    const author = newest?.input?.[0]?.author;
    const who = author ? await nameOf(tx, worker.serverId, author) : null;
    throw new WorkerQuestionClosedError(`Answered by ${who ?? 'someone'}.`);
}

export async function closeWorkerQuestion(
    tx: HausDatabase,
    input: { closed: WorkerQuestionsClosed; turn: TurnRow }
) {
    const { outcome } = input.turn;
    if (outcome?.kind !== 'report') {
        return;
    }
    await tx
        .update(workerTurnsTable)
        .set({
            outcome: { ...outcome, report: { ...outcome.report, questionsClosed: input.closed } },
        })
        .where(
            and(
                eq(workerTurnsTable.serverId, input.turn.serverId),
                eq(workerTurnsTable.id, input.turn.id)
            )
        );
}

async function nameOf(
    tx: Pick<HausDatabase, 'select'>,
    serverId: string,
    author: WorkerTurnInput['author']
) {
    if (author.kind === 'agent') {
        const [agent] = await tx
            .select({ handle: agentsTable.handle })
            .from(agentsTable)
            .where(and(eq(agentsTable.serverId, serverId), eq(agentsTable.id, author.id)))
            .limit(1);
        return agent ? `@${agent.handle}` : null;
    }
    const [member] = await tx
        .select({ handle: serverMembershipsTable.handle })
        .from(serverMembershipsTable)
        .where(
            and(
                eq(serverMembershipsTable.serverId, serverId),
                eq(serverMembershipsTable.userId, author.id)
            )
        )
        .limit(1);
    return member?.handle ? `@${member.handle}` : null;
}
