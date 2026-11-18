import { afterAll, beforeAll, expect, test } from 'bun:test';

import { and, eq } from 'drizzle-orm';

import { claimAgentClaims } from '../src/agent-api/claim-claim.ts';
import { buildClaimConflict } from '../src/claims/claim-conflict.ts';
import type { ResolvedRunner } from '../src/computers/runner-credentials.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { messageClaimsTable } from '../src/postgres/schema.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let owner: HausClient;
let connection: HausConnection;

beforeAll(async () => {
    harness = await startHausServerHarness();
    connection = await connectHausDatabase(harness.databaseUrl);
    owner = createHausClient(harness, await harness.humans.mintSessionToken('user_lens_owner'));
});

afterAll(async () => {
    owner.close();
    await connection?.close();
    await harness.close();
});

test('the default lens hides background claims and counts them', async () => {
    const server = await createServer('lens-background');
    const tracked = await sendMessage(server, 'Ship the release notes');
    await owner.trpc.claim.promote.mutate({ messageId: tracked, serverId: server.id });
    const claimed = await sendMessage(server, 'Check the flaky delivery test');
    await seedAgentClaim(server, claimed);

    const narrow = await owner.trpc.claim.list.query({ serverId: server.id });
    expect(narrow.backgroundCount).toBe(1);
    expect(narrow.claims.map((item) => item.claim.messageId)).toEqual([tracked]);

    const wide = await owner.trpc.claim.list.query({
        includeBackground: true,
        serverId: server.id,
    });
    expect(wide.backgroundCount).toBe(0);
    expect(wide.claims.map(({ claim }) => [claim.origin, claim.tier])).toEqual([
        ['claimed', 'background'],
        ['converted', 'tracked'],
    ]);
});

test("the claimant's own inline reply leaves it in the background lens", async () => {
    const server = await createServer('lens-promotes');
    const claimed = await sendMessage(server, 'Trace the reconnect path');
    const agentId = await seedAgentClaim(server, claimed);

    await replyInlineAsAgent(server, claimed, agentId);

    const listed = await owner.trpc.claim.list.query({ serverId: server.id });
    expect(listed.backgroundCount).toBe(1);
    expect(listed.claims).toEqual([]);
});

// the claimant's own bookkeeping, so only the claimant working there moves it
// onto a person's lens.
test('somebody else replying inline leaves the claim in the background lens', async () => {
    const server = await createServer('lens-chatter');
    const claimed = await sendMessage(server, 'Trace the reconnect timeout');
    await seedAgentClaim(server, claimed);

    await owner.trpc.chat.send.mutate({
        chatId: server.chatId,
        content: 'What did you find?',
        nonce: 'lens-reply-question',
        serverId: server.id,
        replyToMessageId: claimed,
    });

    const listed = await owner.trpc.claim.list.query({ serverId: server.id });
    expect(listed.backgroundCount).toBe(1);
    expect(listed.claims).toEqual([]);
});

test('a lost claim reports the holder, the lock, and what it does not block', async () => {
    const server = await createServer('lens-conflict');
    const claimed = await sendMessage(server, 'Rebuild the search index');
    await seedAgentClaim(server, claimed);
    const [claim] = await connection.db
        .select()
        .from(messageClaimsTable)
        .where(
            and(
                eq(messageClaimsTable.serverId, server.id),
                eq(messageClaimsTable.messageId, claimed)
            )
        );

    const conflict = await buildClaimConflict(
        connection.db,
        server.id,
        claim,
        new Date('2026-09-08T00:00:00.000Z')
    );

    expect(conflict).toMatchObject({
        blockedActions: ['start_conflicting_execution'],
        conflictScope: 'implementation_execution',
        currentAssignee: { name: 'sage', type: 'agent' },
        kind: 'claim_conflict',
        observedAt: '2026-09-08T00:00:00.000Z',
        status: 'in_progress',
    });
    expect(conflict.unblockedActionExamples.length).toBeGreaterThan(0);
});

async function createServer(slug: string) {
    const server = await owner.trpc.server.create.mutate({ displayName: slug, slug });
    return {
        chatId: server.channels[0].id,
        chatName: server.channels[0].name ?? '',
        id: server.id,
    };
}

/** An Agent in the Server's first Channel, with a runner authority to act as. */
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

test('the loser of a claim race learns who holds the lock, not to refresh', async () => {
    // Both Agents read the claim before either wrote it. The loser's row must
    // carry the structured conflict, never a stale-version refresh notice.
    const server = await createServer('lens-race');
    const anchor = await sendMessage(server, 'Cut the release branch');
    await owner.trpc.claim.promote.mutate({ messageId: anchor, serverId: server.id });
    const target = `#${server.chatName}`;
    const [first, second] = await Promise.all([
        seedAgentRunner(server, 'ada'),
        seedAgentRunner(server, 'rook'),
    ]);

    const races = await Promise.all([
        claimAgentClaims(connection.db, first, { numbers: [1], target }),
        claimAgentClaims(connection.db, second, { numbers: [1], target }),
    ]);

    const rows = races.map((race) => race.results[0]);
    expect(rows.filter((row) => row?.outcome === 'claimed')).toHaveLength(1);
    const lost = rows.find((row) => row?.outcome === 'refused');
    expect(lost?.claimConflict).toMatchObject({
        blockedActions: ['start_conflicting_execution'],
        currentAssignee: { type: 'agent' },
        kind: 'claim_conflict',
        status: 'in_progress',
    });
});

async function sendMessage(server: { chatId: string; id: string }, content: string) {
    const sent = await owner.trpc.chat.send.mutate({
        chatId: server.chatId,
        content,
        nonce: `${server.id}:${content}`,
        serverId: server.id,
    });
    return sent.message.id;
}

/** The exact row `haus claim <messageId>` writes, without a Computer. */
async function seedAgentClaim(
    server: { chatId: string; id: string },
    messageId: string
): Promise<string> {
    const [agent] = (await harness.sql`
        insert into agents (id, server_id, handle, display_name, home_timezone)
        values (
            ${`agt_${messageId.slice(4)}`}, ${server.id}, 'sage', 'Sage', 'UTC'
        )
        returning id
    `) as Array<{ id: string }>;
    await harness.sql`
        insert into message_claims (
            server_id, chat_id, message_id, number, origin, status,
            assignee_agent_id, created_by_agent_id, claimed_at
        )
        values (
            ${server.id}, ${server.chatId}, ${messageId},
            (select last_claim_number + 1 from chats where server_id = ${server.id} and id = ${server.chatId}),
            'claimed', 'in_progress', ${agent.id}, ${agent.id}, now()
        )
    `;
    await harness.sql`
        update chats set last_claim_number = last_claim_number + 1
        where server_id = ${server.id} and id = ${server.chatId}
    `;
    return agent.id;
}

async function replyInlineAsAgent(
    server: { chatId: string; id: string },
    anchorMessageId: string,
    agentId: string
) {
    const [chat] = (await harness.sql`
        update chats set last_message_sequence = last_message_sequence + 1
        where server_id = ${server.id} and id = ${server.chatId}
        returning last_message_sequence as sequence
    `) as { sequence: number }[];
    await harness.sql`
        insert into chat_messages (
            id, server_id, chat_id, author_agent_id, content, nonce, sequence,
            session_generation, reply_to_message_id, reply_root_message_id
        )
        values (
            ${`msg_${anchorMessageId.slice(4)}reply`}, ${server.id}, ${server.chatId},
            ${agentId}, 'Traced it; the reconnect path holds.',
            ${`non_${anchorMessageId.slice(4)}`}, ${chat?.sequence ?? 0}, 1,
            ${anchorMessageId}, ${anchorMessageId}
        )
    `;
}
