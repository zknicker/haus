import { afterAll, beforeAll, expect, test } from 'bun:test';
import { claimAgentClaims } from '../src/agent-api/claim-claim.ts';
import { CLAIM_LIST_LIMIT, listAgentClaims } from '../src/agent-api/claim-list.ts';
import type { ResolvedRunner } from '../src/computers/runner-credentials.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let owner: HausClient;
let connection: HausConnection;

beforeAll(async () => {
    harness = await startHausServerHarness();
    connection = await connectHausDatabase(harness.databaseUrl);
    owner = createHausClient(harness, await harness.humans.mintSessionToken('user_batch_owner'));
});

afterAll(async () => {
    owner.close();
    await connection?.close();
    await harness.close();
});

test('a batch claim answers per claim and keeps every granted claim and its event', async () => {
    const server = await createServer('batch-claim');
    const [ada, rook] = await Promise.all([
        seedAgentRunner(server, 'ada'),
        seedAgentRunner(server, 'rook'),
    ]);
    const target = `#${server.chatName}`;
    const first = await createClaim(server, 'Draft the migration');
    const held = await createClaim(server, 'Review the rollout');
    const mine = await createClaim(server, 'Tag the release');
    await claimAgentClaims(connection.db, rook, { numbers: [held.number], target });
    await claimAgentClaims(connection.db, ada, { numbers: [mine.number], target });
    // An unrelated human edit bumps the version; only the holder decides a claim.
    await owner.trpc.claim.update.mutate({
        expectedVersion: first.version,
        messageId: first.messageId,
        patch: { priority: 'high' },
        serverId: server.id,
    });

    const batch = await claimAgentClaims(connection.db, ada, {
        numbers: [first.number, held.number, mine.number, 99],
        target,
    });

    expect(
        batch.results.map(({ number, outcome, reason }) => ({ number, outcome, reason }))
    ).toEqual([
        { number: first.number, outcome: 'claimed', reason: null },
        {
            number: held.number,
            outcome: 'refused',
            reason: 'That claim is already owned by another assignee.',
        },
        { number: mine.number, outcome: 'already_yours', reason: null },
        { number: 99, outcome: 'refused', reason: 'No claim #99 exists in that target.' },
    ]);
    expect(batch.results[0]?.claim).toMatchObject({ assignee: { handle: 'ada' } });
    expect(batch.results[1]?.claimConflict).toMatchObject({
        currentAssignee: { name: 'rook', type: 'agent' },
        kind: 'claim_conflict',
    });
    expect(batch.events.map(({ delivery }) => delivery.event)).toEqual([
        expect.objectContaining({ kind: 'updated', messageId: first.messageId }),
    ]);
    const rows = (await harness.sql`
        select number, assignee_agent_id from message_claims
        where server_id = ${server.id} order by number
    `) as Array<{ assignee_agent_id: string | null; number: number }>;
    expect(rows).toEqual([
        { assignee_agent_id: ada.agentId, number: first.number },
        { assignee_agent_id: rook.agentId, number: held.number },
        { assignee_agent_id: ada.agentId, number: mine.number },
    ]);
});

test('a message-id claim whose numbers miss its claim takes that claim instead of promoting it again', async () => {
    const server = await createServer('message-id-numbers');
    const ada = await seedAgentRunner(server, 'ada');
    const target = `#${server.chatName}`;
    const claim = await createClaim(server, 'Already a claim');

    const batch = await claimAgentClaims(connection.db, ada, {
        messageId: claim.messageId,
        numbers: [claim.number + 1],
        target,
    });

    expect(batch.results.map(({ number, outcome }) => ({ number, outcome }))).toEqual([
        { number: claim.number, outcome: 'claimed' },
        { number: claim.number + 1, outcome: 'refused' },
    ]);
    const [row] = (await harness.sql`
        select count(*)::int as total from message_claims where server_id = ${server.id}
    `) as Array<{ total: number }>;
    expect(row?.total).toBe(1);
});

test('claim list defaults to unfinished work, widens with all, and filters to mine', async () => {
    const server = await createServer('list-defaults');
    const ada = await seedAgentRunner(server, 'ada');
    const target = `#${server.chatName}`;
    const open = await createClaim(server, 'Open work');
    const claimed = await createClaim(server, 'Claimed work');
    const finished = await createClaim(server, 'Finished work');
    await claimAgentClaims(connection.db, ada, { numbers: [claimed.number], target });
    await harness.sql`
        update message_claims set status = 'done'
        where server_id = ${server.id} and message_id = ${finished.messageId}
    `;

    const numbers = async (input: Parameters<typeof listAgentClaims>[2]) =>
        (await listAgentClaims(connection.db, ada, { target, ...input })).claims
            .map((claim) => claim.number)
            .sort();

    expect(await numbers({})).toEqual([open.number, claimed.number].sort());
    expect(await numbers({ status: 'all' })).toEqual(
        [open.number, claimed.number, finished.number].sort()
    );
    expect(await numbers({ mine: true })).toEqual([claimed.number]);
});

test('claim list stops at its limit and reports how many rows it left out', async () => {
    const server = await createServer('list-limit');
    const ada = await seedAgentRunner(server, 'ada');
    for (let index = 0; index < CLAIM_LIST_LIMIT + 3; index += 1) {
        await createClaim(server, `Bulk claim ${index}`);
    }

    const listed = await listAgentClaims(connection.db, ada, { target: `#${server.chatName}` });

    expect(listed.claims).toHaveLength(CLAIM_LIST_LIMIT);
    expect(listed.omitted).toBe(3);
});

async function createServer(slug: string) {
    const server = await owner.trpc.server.create.mutate({ displayName: slug, slug });
    return {
        chatId: server.channels[0].id,
        chatName: server.channels[0].name ?? '',
        id: server.id,
    };
}

async function createClaim(server: { chatId: string; id: string }, content: string) {
    const created = await owner.trpc.claim.create.mutate({
        chatId: server.chatId,
        content,
        nonce: `${server.id}:${content}`,
        serverId: server.id,
    });
    return created.claim;
}

async function seedAgentRunner(
    server: { chatId: string; id: string },
    handle: string
): Promise<ResolvedRunner> {
    const agentId = `agt_${handle}${server.id.slice(4, 12)}`;
    await harness.sql`
        insert into agents (id, server_id, handle, display_name, home_timezone)
        values (${agentId}, ${server.id}, ${handle}, ${handle}, 'UTC')
    `;
    await harness.sql`
        insert into channel_agent_participants (server_id, chat_id, agent_id)
        values (${server.id}, ${server.chatId}, ${agentId})
    `;
    return {
        agentId,
        capabilities: [],
        chatId: server.chatId,
        computerId: `cmp_${handle}`,
        runId: `run_${handle}`,
        runnerId: `rnr_${handle}`,
        serverId: server.id,
    };
}
