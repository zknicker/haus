import { afterAll, beforeAll, expect, test } from 'bun:test';
import { seedDevelopmentInboxActivity } from '../src/development/seed-inbox-activity.ts';
import { seedDevelopmentServer } from '../src/development/seed-server.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

const subject = 'user_dev_inbox_owner';

let harness: HausServerHarness;
let database: HausConnection;
let owner: HausClient;
let serverId: string;
let userId: string;

beforeAll(async () => {
    harness = await startHausServerHarness();
    database = await connectHausDatabase(harness.databaseUrl);
    harness.humans.setVerifiedEmails(subject, ['dev@haus.test']);
    owner = createHausClient(harness, await harness.humans.mintSessionToken(subject));
    userId = harness.humans.userIdForSubject(subject);
    serverId = (await seedDevelopmentServer(database.db, userId)).id;
});

afterAll(async () => {
    owner.close();
    await database?.close();
    await harness?.close();
});

// The demo workspace is judged from the Inbox, so every section of that page
// is proved through the read the App actually issues.
test('Unread reads the demo Chats with their last line', async () => {
    const chats = await owner.trpc.chat.list.query({ serverId });
    const all = chats.find((chat) => chat.isAll);
    const product = chats.find((chat) => chat.name === 'product');
    const dms = chats.filter((chat) => chat.kind === 'captain');

    expect(all?.lastMessage).toMatchObject({
        authorDisplayName: 'Blippy',
        content: 'Pushed the sidebar badge fix — PR is up for a look.',
    });
    expect(all?.unreadCount).toBeGreaterThan(0);
    expect(product?.lastMessage).toMatchObject({
        authorDisplayName: 'Blippy',
        content: expect.stringContaining('the migration check is the blocker'),
    });
    expect(product?.unreadCount).toBeGreaterThan(0);
    expect(
        dms.map((chat) => chat.lastMessage?.content).filter((content) => content !== undefined)
    ).toEqual(
        expect.arrayContaining([
            expect.stringContaining('Two catches'),
            'Sounds right — badge PR first, then the reminders.',
        ])
    );
    expect(dms.every((chat) => chat.unreadCount > 0 || chat.lastMessage === null)).toBe(true);
});

test('Blippy @mentions the owner in #product', async () => {
    const mentions = (await harness.sql`
        select message.content
        from chat_messages message
        join chats on chats.server_id = message.server_id and chats.id = message.chat_id
        join agents on agents.server_id = message.server_id and agents.id = message.author_agent_id
        where message.server_id = ${serverId}
          and chats.name = 'product'
          and agents.handle = 'blippy'
          and ${userId} = any(message.mentioned_user_ids)
    `) as { content: string }[];
    expect(
        mentions.filter((mention) => mention.content.includes('Rename #product to #build?'))
    ).toHaveLength(1);
});

test('Unread holds Tiny’s inline answer in the DM; the claim is on Claims', async () => {
    const agents = await owner.trpc.agent.list.query({ serverId });
    const agentId = (handle: string) => agents.find((agent) => agent.handle === handle)?.id;
    const chats = await owner.trpc.chat.list.query({ serverId });
    const tiny = chats.find((chat) => chat.peerAgentId === agentId('tiny'));
    expect(tiny?.unreadCount).toBeGreaterThan(0);
    expect(tiny?.lastMessage?.content).toContain('The mini is two releases behind');

    const blippyId = agents.find((agent) => agent.handle === 'blippy')?.id;
    const { claims } = await owner.trpc.claim.list.query({ includeBackground: false, serverId });
    const held = claims.filter(
        (item) => item.claim.origin === 'claimed' && item.claim.assigneeAgentId === blippyId
    );

    expect(held).toHaveLength(1);
    expect(held[0]?.claim).toMatchObject({
        assigneeAgentId: blippyId,
        live: false,
        status: 'in_progress',
        tier: 'tracked',
    });
    expect(held[0]?.message.content).toContain('Reminders on the weekly digest fired twice');
});

test('the roster reads seven days of turns for every demo Agent', async () => {
    const agents = await owner.trpc.agent.list.query({ serverId });
    const turnsByHandle = new Map<string, number>();
    for (const agent of agents) {
        const turns = await owner.trpc.agent.turns.query({
            agentId: agent.id,
            limit: 50,
            serverId,
        });
        turnsByHandle.set(agent.handle, turns.length);
        expect(turns.every((turn) => turn.summary !== null && turn.summary.length > 0)).toBe(true);
    }
    // The Inbox seed's turns.
    expect(turnsByHandle.get('blippy')).toBe(13);
    expect(turnsByHandle.get('tiny')).toBe(9);
    expect([...turnsByHandle.keys()].sort()).toEqual(['blippy', 'tiny']);

    const blippyId = agents.find((agent) => agent.handle === 'blippy')?.id ?? '';
    const blippyTurns = await owner.trpc.agent.turns.query({
        agentId: blippyId,
        limit: 50,
        serverId,
    });
    expect(blippyTurns.filter((turn) => turn.status === 'failed')).toHaveLength(1);
    expect(blippyTurns[0]?.startedAt.localeCompare(blippyTurns[1]?.startedAt ?? '')).toBe(1);
});

test('seeding again adds nothing', async () => {
    const before = await countActivity();
    const again = await seedDevelopmentServer(database.db, userId);

    expect(again.id).toBe(serverId);
    expect(await countActivity()).toEqual(before);
});

async function countActivity() {
    const [counts] = (await harness.sql`
        select
            (select count(*) from chat_messages where server_id = ${serverId}) as messages,
            (select count(*) from message_claims where server_id = ${serverId}) as claims,
            (select count(*) from agent_turns where server_id = ${serverId}) as turns,
            (select count(*) from chats where server_id = ${serverId}) as chats
    `) as Record<string, string>[];
    return counts;
}

// The seed runs inside every dev bootstrap, so a Server that is not the demo
// workspace — one a developer made by hand, or a database that predates the
// seed — has to boot untouched rather than fail the whole App load.
test('a Server without the demo shape is left alone', async () => {
    const plain = await owner.trpc.server.create.mutate({
        displayName: 'Plain Workspace',
        slug: 'plain-workspace',
    });
    const members = await owner.trpc.member.list.query({ serverId: plain.id });
    const before = await owner.trpc.chat.list.query({ serverId: plain.id });

    await expect(
        seedDevelopmentInboxActivity(database.db, {
            serverId: plain.id,
            userId: members.viewerUserId,
        })
    ).resolves.toBeUndefined();

    const after = await owner.trpc.chat.list.query({ serverId: plain.id });
    expect(after.map((chat) => chat.lastMessageSequence)).toEqual(
        before.map((chat) => chat.lastMessageSequence)
    );
});

test('UI gallery reads its sample messages', async () => {
    const chats = await owner.trpc.chat.list.query({ serverId });
    const gallery = chats.find((chat) => chat.name === 'ui-gallery');
    expect(gallery).toBeDefined();
    const chatId = gallery?.id ?? '';
    const transcript = await owner.trpc.chat.messages.query({ serverId, chatId });
    expect(transcript.messages).toHaveLength(22);
    expect(
        transcript.messages.filter((message) => message.content.includes('user://'))
    ).toHaveLength(6);
});
