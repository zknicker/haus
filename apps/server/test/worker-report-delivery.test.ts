import { afterAll, beforeAll, expect, test } from 'bun:test';
import { agentInboxItemSchema } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { readMessagesById } from '../src/chats/read-messages-by-id.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import {
    agentInboxTable,
    chatMessagesTable,
    taskPullRequestsTable,
} from '../src/postgres/schema.ts';
import { offlineDelivery } from './agent-inbox-harness.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';
import { addTask, observe, readTurns, seedWorkerBoard, startOn } from './worker-board.fixture.ts';

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

const pullRequestUrl = 'https://github.com/haus/haus/pull/412';

test('a report posts one Message in the Task and queues one worker_report item for its Agent', async () => {
    const board = await seedWorkerBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { worker } = (await startOn(connection.db, board)).receipt;
    const turnId = worker.turns[0]?.turnId ?? '';

    const settled = await observe(connection.db, delivery, board, {
        result: {
            outcome: 'needs-you',
            personHandle: `@${board.seed.humanHandle}`,
            pullRequestUrls: [pullRequestUrl],
            text: 'The iPad baseline moves 2px. Is that intended?',
        },
        status: 'completed',
        turnId,
        workerId: worker.id,
    });

    const [turn] = await readTurns(connection.db, worker.id);
    const messageId = turn?.outcome?.kind === 'report' ? turn.outcome.report.messageId : null;
    expect(turn?.outcome).toEqual({
        kind: 'report',
        report: {
            ask: 'The iPad baseline moves 2px. Is that intended?',
            messageId,
            outcome: 'needs-you',
            personId: board.seed.userId,
            personRefused: null,
            pullRequestUrls: [pullRequestUrl],
            source: 'provider',
            text: 'The iPad baseline moves 2px. Is that intended?',
        },
    });
    const posted = await connection.db
        .select()
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.chatId, board.task.chatId));
    expect(
        posted.map(({ authorAgentId, bodyKind, content, id }) => ({
            authorAgentId,
            bodyKind,
            content,
            id,
        }))
    ).toEqual([
        {
            authorAgentId: board.seed.agentId,
            bodyKind: 'worker-report',
            content: `The iPad baseline moves 2px. Is that intended?\n\n[@${board.seed.humanHandle}](user://${board.seed.userId})\n\n${pullRequestUrl}`,
            id: messageId ?? '',
        },
    ]);
    const projected = await readMessagesById(connection.db, board.seed.serverId, [messageId ?? '']);
    expect(projected.get(messageId ?? '')?.body).toEqual({
        kind: 'worker-report',
        outcome: 'needs-you',
        turnId,
        workerId: worker.id,
    });
    expect(await queuedReports(board.seed.agentId)).toEqual([
        { chatId: board.task.chatId, dedupeKey: `worker-report:${turnId}`, workerTurnId: turnId },
    ]);
    expect(settled?.wakes).toContainEqual({
        agentId: board.seed.agentId,
        serverId: board.seed.serverId,
    });
    const attached = await connection.db
        .select({
            number: taskPullRequestsTable.number,
            repository: taskPullRequestsTable.repository,
        })
        .from(taskPullRequestsTable)
        .where(eq(taskPullRequestsTable.taskId, board.task.id));
    expect(attached).toEqual([{ number: 412, repository: 'haus/haus' }]);
});

test('a person the Server cannot accept leaves the ask for the Agent, and posts no mention', async () => {
    const board = await seedWorkerBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { worker } = (await startOn(connection.db, board)).receipt;

    await observe(connection.db, delivery, board, {
        result: {
            outcome: 'needs-you',
            personHandle: '@nobody-here',
            pullRequestUrls: [],
            text: 'Which default?',
        },
        status: 'completed',
        turnId: worker.turns[0]?.turnId ?? '',
        workerId: worker.id,
    });

    const [turn] = await readTurns(connection.db, worker.id);
    expect(turn?.outcome).toMatchObject({
        kind: 'report',
        report: { personId: null, personRefused: 'nobody-here' },
    });
    const [message] = await connection.db
        .select({ content: chatMessagesTable.content })
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.chatId, board.task.chatId));
    expect(message?.content).toBe('Which default?');
});

test('reports from several Workers on one Task ride one Agent run, and another Task waits', async () => {
    const board = await seedWorkerBoard(connection.db);
    const { delivery, wake } = offlineDelivery(connection.db, board.seed);
    const other = await addTask(connection.db, board.board, 'Ship the iPhone build');
    const finish = async (task: typeof board.task, text: string) => {
        const { worker } = (await startOn(connection.db, { ...board, task })).receipt;
        await observe(connection.db, delivery, board, {
            result: { outcome: 'done', personHandle: null, pullRequestUrls: [], text },
            status: 'completed',
            turnId: worker.turns[0]?.turnId ?? '',
            workerId: worker.id,
        });
        return worker.turns[0]?.turnId ?? '';
    };
    const first = await finish(board.task, 'First is done.');
    const elsewhere = await finish(other, 'The other Task is done.');
    const second = await finish(board.task, 'Second is done.');

    const frame = await wake();

    expect(frame?.chatId).toBe(board.task.chatId);
    expect(frame?.inboxDelivery).toBe('concrete');
    expect(frame?.drainItemIds).toEqual([`worker-report:${first}`, `worker-report:${second}`]);
    const items = (frame?.inbox ?? []).map((item) => agentInboxItemSchema.parse(item));
    expect(
        items.map(({ workerReport }) => [
            workerReport?.taskKey,
            workerReport?.turnId,
            workerReport?.outcome.kind,
        ])
    ).toEqual([
        [board.task.key, first, 'report'],
        [board.task.key, second, 'report'],
    ]);
    expect(items.map((item) => [item.id, item.sequence, item.senderType])).toEqual([
        [`worker-report:${first}`, 0, 'system'],
        [`worker-report:${second}`, 0, 'system'],
    ]);
    expect(await queuedReports(board.seed.agentId)).toContainEqual({
        chatId: other.chatId,
        dedupeKey: `worker-report:${elsewhere}`,
        workerTurnId: elsewhere,
    });
});

async function queuedReports(agentId: string) {
    return await connection.db
        .select({
            chatId: agentInboxTable.chatId,
            dedupeKey: agentInboxTable.dedupeKey,
            workerTurnId: agentInboxTable.workerTurnId,
        })
        .from(agentInboxTable)
        .where(
            and(
                eq(agentInboxTable.agentId, agentId),
                eq(agentInboxTable.source, 'worker_report'),
                eq(agentInboxTable.state, 'queued')
            )
        );
}
