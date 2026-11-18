import { afterAll, beforeAll, expect, test } from 'bun:test';
import { assignAgentClaim } from '../src/agent-api/claim-assign.ts';
import { claimAgentClaims } from '../src/agent-api/claim-claim.ts';
import { updateAgentClaim } from '../src/agent-api/claims.ts';
import { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import type { ResolvedRunner } from '../src/computers/runner-credentials.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { FakeTransport } from './background-claim-fixture.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let owner: HausClient;
let connection: HausConnection;
let delivery: AgentDelivery;

beforeAll(async () => {
    harness = await startHausServerHarness();
    connection = await connectHausDatabase(harness.databaseUrl);
    delivery = new AgentDelivery(connection.db, new FakeTransport());
    owner = createHausClient(harness, await harness.humans.mintSessionToken('user_perm_owner'));
});

afterAll(async () => {
    owner.close();
    await connection?.close();
    await harness.close();
});

test('any member Agent moves status along the transition table, not only the holder', async () => {
    const server = await createServer('member-status');
    const [ada, rook] = await Promise.all([seedAgent(server, 'ada'), seedAgent(server, 'rook')]);
    const claim = await createClaim(server, 'Ship the importer');
    await claimAgentClaims(connection.db, ada, { numbers: [claim.number], target: server.target });
    await update(ada, claim.number, 'in_review');

    // Rook reviews Ada's claim and finishes it without holding it.
    const done = await update(rook, claim.number, 'done');
    expect(done.claim).toMatchObject({ assignee: { handle: 'ada' }, status: 'done' });

    await expect(update(rook, claim.number, 'done')).rejects.toThrow('already done');
    const fresh = await createClaim(server, 'Unstarted work');
    await expect(update(rook, fresh.number, 'done')).rejects.toThrow(
        'A claim cannot move from todo to done.'
    );
    await expect(update(rook, fresh.number, 'in_progress')).rejects.toThrow(
        'Take the claim before moving it to in_progress.'
    );
});

test('a Server Owner still sets any status directly', async () => {
    const server = await createServer('owner-status');
    const claim = await createClaim(server, 'Owner closes this out');
    const updated = await owner.trpc.claim.update.mutate({
        expectedVersion: claim.version,
        messageId: claim.messageId,
        patch: { status: 'done' },
        serverId: server.id,
    });
    expect(updated.claim.status).toBe('done');
});

test('an Agent reassigns a held claim to a peer without moving status, and the peer gets the handoff', async () => {
    const server = await createServer('assign-held');
    const [ada, rook, kit] = await Promise.all([
        seedAgent(server, 'ada'),
        seedAgent(server, 'rook'),
        seedAgent(server, 'kit'),
    ]);
    const claim = await createClaim(server, 'Rotate the signing key');
    await claimAgentClaims(connection.db, rook, { numbers: [claim.number], target: server.target });

    const result = await assign(ada, claim.number, '@kit');

    expect(result.claim).toMatchObject({ assignee: { handle: 'kit' }, status: 'in_progress' });
    expect(result.wakes).toEqual([kit.agentId]);
    const [row] = (await harness.sql`
        select claimed_at, status from message_claims
        where server_id = ${server.id} and message_id = ${claim.messageId}
    `) as { claimed_at: Date | null; status: string }[];
    expect(row).toEqual({ claimed_at: null, status: 'in_progress' });
    const handoffs = (await harness.sql`
        select content from agent_inbox
        where server_id = ${server.id} and agent_id = ${kit.agentId}
          and source = 'claim_assignment'
    `) as { content: string }[];
    expect(handoffs.map((handoff) => handoff.content)).toEqual([
        `[Haus claim assignment claim=#${claim.number} target=${server.target} assignedBy=@ada] Rotate the signing key`,
    ]);

    const cleared = await assignAgentClaim(connection.db, ada, delivery, {
        assignee: null,
        number: claim.number,
        target: server.target,
    });
    expect(cleared.claim).toMatchObject({ assignee: null, status: 'in_progress' });
});

test('an Agent cannot assign a person, and loses to a stale revision', async () => {
    const server = await createServer('assign-human');
    const ada = await seedAgent(server, 'ada');
    await harness.sql`
        update server_memberships set handle = 'perm-owner' where server_id = ${server.id}
    `;
    const claim = await createClaim(server, 'Approve the budget');

    // Claims are Agent work (ADR 0037): a person is @mentioned, never assigned.
    await expect(
        assignAgentClaim(connection.db, ada, delivery, {
            assignee: '@perm-owner',
            expectedRevision: claim.version,
            number: claim.number,
            target: server.target,
        })
    ).rejects.toThrow(/@perm-owner is not assignable/u);

    const assigned = await assignAgentClaim(connection.db, ada, delivery, {
        assignee: '@ada',
        expectedRevision: claim.version,
        number: claim.number,
        target: server.target,
    });
    expect(assigned.claim).toMatchObject({ assignee: { handle: 'ada' }, status: 'todo' });

    await expect(
        assignAgentClaim(connection.db, ada, delivery, {
            assignee: null,
            expectedRevision: claim.version,
            number: claim.number,
            target: server.target,
        })
    ).rejects.toThrow(/changed \(revision 2, expected 1\)/u);
});

test('missing, retired, and out-of-chat handles answer one uniform refusal', async () => {
    const server = await createServer('assign-uniform');
    const ada = await seedAgent(server, 'ada');
    await seedAgent(server, 'outsider', { joinChat: false });
    const retired = await seedAgent(server, 'gone');
    await harness.sql`update agents set retired_at = now() where id = ${retired.agentId}`;
    const claim = await createClaim(server, 'Nobody odd owns this');

    for (const handle of ['@ghost', '@outsider', '@gone']) {
        await expect(assign(ada, claim.number, handle)).rejects.toThrow(
            `${handle} is not assignable in this chat.`
        );
    }
    const [row] = (await harness.sql`
        select version from message_claims
        where server_id = ${server.id} and message_id = ${claim.messageId}
    `) as { version: number }[];
    expect(row?.version).toBe(claim.version);
});

const targets = new Map<string, string>();

function update(
    runner: ResolvedRunner,
    number: number,
    status: 'done' | 'in_progress' | 'in_review'
) {
    const target = targets.get(runner.serverId) ?? '';
    return updateAgentClaim(connection.db, runner, { number, status, target });
}

function assign(runner: ResolvedRunner, number: number, assignee: string) {
    const target = targets.get(runner.serverId) ?? '';
    return assignAgentClaim(connection.db, runner, delivery, { assignee, number, target });
}

async function createServer(slug: string) {
    const server = await owner.trpc.server.create.mutate({
        displayName: slug,
        slug: `perm-${slug}`,
    });
    const target = `#${server.channels[0].name ?? ''}`;
    targets.set(server.id, target);
    return { chatId: server.channels[0].id, id: server.id, target };
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

async function seedAgent(
    server: { chatId: string; id: string; target: string },
    handle: string,
    options: { joinChat: boolean } = { joinChat: true }
): Promise<ResolvedRunner> {
    const agentId = `agt_${handle}${server.id.slice(4, 12)}`;
    await harness.sql`
        insert into agents (id, server_id, handle, display_name, home_timezone)
        values (${agentId}, ${server.id}, ${handle}, ${handle}, 'UTC')
    `;
    if (options.joinChat) {
        await harness.sql`
            insert into channel_agent_participants (server_id, chat_id, agent_id)
            values (${server.id}, ${server.chatId}, ${agentId})
        `;
    }
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
