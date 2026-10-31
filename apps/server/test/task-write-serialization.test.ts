import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { updateAgentTask } from '../src/agent-api/tasks.ts';
import type { ResolvedRunner } from '../src/computers/runner-credentials.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import {
    channelAgentParticipantsTable,
    channelParticipantsTable,
    usersTable,
} from '../src/postgres/schema.ts';
import { updateTask } from '../src/tasks/update-task.ts';
import type { HausUser } from '../src/users/haus-user.ts';
import {
    type BackgroundClaim,
    beginRun,
    readTask,
    seedBackgroundClaim,
    turnSummary,
} from './background-claim-fixture.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';
import { serializedTransactions } from './serialized-db-fixture.ts';

/**
 * A task write projects its result — labels, tier evidence, liveness — before
 * it commits, and every one of those reads has to run on the transaction's own
 * connection, one at a time. A read that overlaps another leaves the
 * transaction idle holding the Server row lock it took first, and every later
 * durable write queues behind it until the process dies. These tests drive the
 * three write paths that project a task and fail the moment one overlaps.
 */
let cluster: PostgresCluster;
let connection: HausConnection;

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
});

afterAll(async () => {
    await connection?.close();
    await cluster?.stop();
});

const settleTimeoutMs = 10_000;

test(
    'the Agent API resolves a live claim to done without wedging its transaction',
    async () => {
        const claim = await seedLiveClaim();
        const run = await beginRun(connection.db, claim);

        const result = await updateAgentTask(
            serializedTransactions(connection.db),
            runner(claim, run.runId),
            {
                number: 1,
                status: 'done',
                target: '#dispatch',
            }
        );

        expect(result.task.status).toBe('done');
        // Finished inside the run that still holds it: live, and still the
        // Agent's own bookkeeping rather than something to put on a board.
        expect(await readTask(connection.db, claim)).toMatchObject({
            live: true,
            status: 'done',
            tier: 'background',
        });
    },
    settleTimeoutMs
);

test(
    'a human update projects the same claim without wedging its transaction',
    async () => {
        const claim = await seedLiveClaim();
        await beginRun(connection.db, claim);
        const before = await readTask(connection.db, claim);

        const result = await updateTask(
            serializedTransactions(connection.db),
            await member(claim),
            {
                expectedVersion: before?.version ?? 0,
                messageId: claim.messageId,
                patch: { status: 'in_review' },
                serverId: claim.serverId,
            }
        );

        // Review is a person steering the work, so the claim leaves the
        // background lens for good even while its run still holds it.
        expect(result.task).toMatchObject({ live: true, status: 'in_review', tier: 'tracked' });
    },
    settleTimeoutMs
);

test(
    'run settlement projects its claims without wedging its transaction',
    async () => {
        const claim = await seedLiveClaim();
        const run = await beginRun(serializedTransactions(connection.db), claim);

        await run.delivery.onTurnSettled(claim.computerId, turnSummary(claim.agentId, run.runId));

        // The run settled without answering in the Chat, so the work outlived
        // the turn and the claim becomes a person's to see.
        expect(await readTask(connection.db, claim)).toMatchObject({
            live: false,
            status: 'in_progress',
            tier: 'tracked',
        });
    },
    settleTimeoutMs
);

/** A claimed Channel message whose assignee Agent has an in-flight run. */
async function seedLiveClaim(): Promise<BackgroundClaim> {
    const claim = await seedBackgroundClaim(connection.db);
    await connection.db.insert(channelAgentParticipantsTable).values({
        agentId: claim.agentId,
        chatId: claim.chatId,
        serverId: claim.serverId,
    });
    await connection.db.insert(channelParticipantsTable).values({
        chatId: claim.chatId,
        serverId: claim.serverId,
        userId: claim.userId,
    });
    return claim;
}

function runner(claim: BackgroundClaim, runId: string): ResolvedRunner {
    return {
        agentId: claim.agentId,
        capabilities: [],
        chatId: claim.chatId,
        computerId: claim.computerId,
        runId,
        runnerId: 'rnr_serialization',
        serverId: claim.serverId,
    };
}

async function member(claim: BackgroundClaim): Promise<HausUser> {
    const [user] = await connection.db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.id, claim.userId));
    return user;
}
