import { afterAll, beforeAll, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { agentInboxTable, chatMessagesTable } from '../src/postgres/schema.ts';
import { findUserById } from '../src/users/haus-user.ts';
import { sendPersonFollowUp } from '../src/workers/send-person-follow-up.ts';
import { sendAgentFollowUp } from '../src/workers/worker-operations.ts';
import { offlineDelivery } from './agent-inbox-harness.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';
import { observe, readTurns, seedWorkerBoard, startOn } from './worker-board.fixture.ts';

let cluster: TestDatabase;
let connection: HausConnection;

beforeAll(async () => {
    cluster = await startMigratedDatabase();
    connection = await connectHausDatabase(cluster.databaseUrl);
});

afterAll(async () => {
    await connection?.close();
    await cluster?.stop();
});

test("a person's follow-up posts in the Task, reaches the Agent, and runs after the working turn", async () => {
    const board = await seedWorkerBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { worker } = (await startOn(connection.db, board)).receipt;
    const working = worker.turns[0]?.turnId ?? '';
    const member = await readMember(board.seed.userId);

    const sent = await sendPersonFollowUp(
        connection.db,
        member,
        {
            nonce: 'card-1',
            serverId: board.seed.serverId,
            text: 'Keep the old fixture too.',
            workerId: worker.id,
        },
        delivery
    );

    expect(sent.effects.frames).toEqual([]);
    const [message] = await connection.db
        .select()
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.id, sent.messageId));
    expect(message).toMatchObject({
        authorUserId: board.seed.userId,
        bodyKind: 'worker-follow-up',
        chatId: board.task.chatId,
        content: 'Keep the old fixture too.',
    });
    expect(await queuedFor(board.seed.agentId, sent.messageId)).toEqual([
        { dedupeKey: sent.messageId, source: 'human' },
    ]);
    const [, next] = await readTurns(connection.db, worker.id);
    expect(next?.dispatchedAt).toBeNull();
    expect(next?.input).toEqual([
        {
            at: next?.input?.[0]?.at ?? '',
            author: { id: board.seed.userId, kind: 'user' },
            kind: 'follow-up',
            messageId: sent.messageId,
            text: 'Keep the old fixture too.',
        },
    ]);

    const replayed = await sendPersonFollowUp(
        connection.db,
        member,
        {
            nonce: 'card-1',
            serverId: board.seed.serverId,
            text: 'Keep the old fixture too.',
            workerId: worker.id,
        },
        delivery
    );
    expect(replayed.messageId).toBe(sent.messageId);
    expect((await readTurns(connection.db, worker.id))[1]?.input).toHaveLength(1);

    const settled = await observe(connection.db, delivery, board, {
        result: { outcome: 'done', personHandle: null, pullRequestUrls: [], text: 'Done.' },
        status: 'completed',
        turnId: working,
        workerId: worker.id,
    });
    expect(
        settled?.frames.map(({ frame }) => frame.type === 'worker-turn-start' && frame.turnId)
    ).toEqual([next?.id]);
});

test('Agent follow-ups queued while a turn works ride one next turn, labelled in order', async () => {
    const board = await seedWorkerBoard(connection.db);
    const { worker } = (await startOn(connection.db, board)).receipt;
    const send = (nonce: string, text: string, interrupt = false) =>
        sendAgentFollowUp(connection.db, board.runner, {
            interrupt,
            nonce,
            text,
            workerId: worker.id,
        });

    const first = await send('one', 'First note.');
    const second = await send('two', 'Second note.');
    const retried = await send('one', 'First note.');

    expect(second.receipt.turnId).toBe(first.receipt.turnId);
    expect(retried.receipt).toMatchObject({ idempotent: true, turnId: first.receipt.turnId });
    expect(first.effects.frames).toEqual([]);
    const [, next] = await readTurns(connection.db, worker.id);
    expect(next?.input?.map((input) => input.text)).toEqual(['First note.', 'Second note.']);
    const messages = await connection.db
        .select({ id: chatMessagesTable.id })
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.chatId, board.task.chatId));
    expect(messages).toEqual([]);

    const interrupted = await send('three', 'Stop and do this instead.', true);
    const turns = await readTurns(connection.db, worker.id);
    expect(
        turns.map((turn) => [turn.outcome?.kind ?? null, turn.input?.map((input) => input.text)])
    ).toEqual([
        [null, ['Make the delivery test deterministic.']],
        ['stopped', ['First note.', 'Second note.']],
        [null, ['Stop and do this instead.']],
    ]);
    expect(interrupted.receipt.turnId).toBe(turns[2]?.id);
    expect(interrupted.effects.frames.map(({ frame }) => frame.type)).toEqual(['worker-stop']);
});

async function readMember(userId: string) {
    const member = await findUserById(connection.db, userId);
    if (!member) {
        throw new Error('The seeded person is missing.');
    }
    return member;
}

async function queuedFor(agentId: string, dedupeKey: string) {
    return await connection.db
        .select({ dedupeKey: agentInboxTable.dedupeKey, source: agentInboxTable.source })
        .from(agentInboxTable)
        .where(and(eq(agentInboxTable.agentId, agentId), eq(agentInboxTable.dedupeKey, dedupeKey)));
}
