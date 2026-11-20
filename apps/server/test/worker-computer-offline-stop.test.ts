import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import {
    agentInboxTable,
    chatMessagesTable,
    messageDriveCitationsTable,
    taskPullRequestsTable,
    workerTurnsTable,
} from '../src/postgres/schema.ts';
import { stopAgentWorker } from '../src/workers/worker-operations.ts';
import { offlineDelivery } from './agent-inbox-harness.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';
import { type WorkerBoard, closeTask } from './worker-board.fixture.ts';
import {
    computerPlaceBoard,
    readTurn,
    startComputerWorker,
} from './worker-computer-turn.fixture.ts';

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

const pullRequestUrl = 'https://github.com/haus/haus/pull/12';

test('stopping a Worker whose Computer is offline settles its recorded draft as the report', async () => {
    const board = await computerPlaceBoard(connection.db);
    const { turnId, workerId } = await startComputerWorker(connection.db, board);
    const path = await recordDraft(board, turnId, workerId);
    await takeComputerOffline(board);

    await stopAgentWorker(connection.db, board.runner, workerId);

    expect(await readPosted(board, turnId)).toEqual({
        citations: [{ artifactId: 'art_pushed', path, revisionId: 'rev_pushed' }],
        content: `See [it](drive://${path}).\n\n${pullRequestUrl}`,
        pullRequests: [{ number: 12, repository: 'haus/haus' }],
        reportItems: [{ source: 'worker_report' }],
    });
});

test('closing the Task of a Worker whose Computer is offline settles its draft as the report', async () => {
    const board = await computerPlaceBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const { turnId, workerId } = await startComputerWorker(connection.db, board);
    const path = await recordDraft(board, turnId, workerId);
    await takeComputerOffline(board);

    await closeTask(connection.db, board, delivery);

    expect(await readPosted(board, turnId)).toEqual({
        citations: [{ artifactId: 'art_pushed', path, revisionId: 'rev_pushed' }],
        content: `See [it](drive://${path}).\n\n${pullRequestUrl}`,
        pullRequests: [{ number: 12, repository: 'haus/haus' }],
        reportItems: [{ source: 'worker_report' }],
    });
});

test('stopping an offline Worker with no draft settles it stopped and posts nothing', async () => {
    const board = await computerPlaceBoard(connection.db);
    const { turnId, workerId } = await startComputerWorker(connection.db, board);
    await takeComputerOffline(board);

    await stopAgentWorker(connection.db, board.runner, workerId);

    expect((await readTurn(connection.db, turnId))?.outcome).toEqual({ kind: 'stopped' });
});

async function recordDraft(board: WorkerBoard, turnId: string, workerId: string) {
    const path = `agents/a/reports/${board.task.key}/r.md`;
    await connection.db.execute(sql`
        insert into drive_pushes (id, server_id, agent_id, worker_id, closed_at)
        values (${turnId}, ${board.seed.serverId}, ${board.seed.agentId}, ${workerId}, now())`);
    await connection.db.execute(sql`
        insert into drive_push_outcomes (server_id, push_id, author_key, request_id, operation,
            content_type, path_key, outcome)
        values (${board.seed.serverId}, ${turnId}, ${`worker:${workerId}`}, 'dp_cited_00000000',
            'put', 'text/markdown', ${path.toLowerCase()}, ${JSON.stringify({
                current: { artifact_id: 'art_pushed', revision_id: 'rev_pushed' },
                outcome: 'committed',
                path,
            })}::jsonb)`);
    await connection.db
        .update(workerTurnsTable)
        .set({
            reportDraft: {
                ask: null,
                outcome: 'done',
                personId: null,
                pullRequestUrls: [pullRequestUrl],
                text: `See [it](drive://${path}).`,
            },
        })
        .where(eq(workerTurnsTable.id, turnId));
    return path;
}

async function takeComputerOffline(board: WorkerBoard) {
    await connection.db.execute(sql`update computers
        set health = 'offline', disconnected_at = now() where id = ${board.seed.computerId}`);
}

async function readPosted(board: WorkerBoard, turnId: string) {
    const outcome = (await readTurn(connection.db, turnId))?.outcome;
    const messageId = outcome?.kind === 'report' ? (outcome.report.messageId ?? '') : '';
    const [message] = await connection.db
        .select({ content: chatMessagesTable.content })
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.id, messageId));
    return {
        citations: await connection.db
            .select({
                artifactId: messageDriveCitationsTable.artifactId,
                path: messageDriveCitationsTable.path,
                revisionId: messageDriveCitationsTable.revisionId,
            })
            .from(messageDriveCitationsTable)
            .where(eq(messageDriveCitationsTable.messageId, messageId)),
        content: message?.content ?? null,
        pullRequests: await connection.db
            .select({
                number: taskPullRequestsTable.number,
                repository: taskPullRequestsTable.repository,
            })
            .from(taskPullRequestsTable)
            .where(eq(taskPullRequestsTable.taskId, board.task.id)),
        reportItems: await connection.db
            .select({ source: agentInboxTable.source })
            .from(agentInboxTable)
            .where(eq(agentInboxTable.workerTurnId, turnId)),
    };
}
