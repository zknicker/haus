import { afterAll, beforeAll, expect, test } from 'bun:test';
import { listComputerCloudAgentWork } from '../src/cloud-agents/list-computer-cloud-agent-work.ts';
import { seedDevelopmentInboxActivity } from '../src/development/seed-inbox-activity.ts';
import { seedDevelopmentServer } from '../src/development/seed-server.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

const clerkUserId = 'user_dev_inbox_owner';

let harness: HausServerHarness;
let database: HausConnection;
let owner: HausClient;
let serverId: string;

beforeAll(async () => {
    harness = await startHausServerHarness();
    database = await connectHausDatabase(harness.databaseUrl);
    harness.clerkUsers.setVerifiedEmails(clerkUserId, ['dev@haus.test']);
    owner = createHausClient(harness, await harness.clerk.mintSessionToken(clerkUserId));
    serverId = (await seedDevelopmentServer(database.db, clerkUserId)).id;
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
    const dms = chats.filter((chat) => chat.kind === 'dm');

    expect(all?.lastMessage).toMatchObject({
        authorDisplayName: 'Blippy',
        content: 'Pushed the sidebar badge fix — PR is up for a look.',
    });
    expect(all?.unreadCount).toBeGreaterThan(0);
    expect(product?.lastMessage).toMatchObject({
        authorDisplayName: 'Tiny',
        content: 'Two build questions landed here again; see the thread for the rename idea.',
    });
    expect(product?.unreadCount).toBeGreaterThan(0);
    expect(
        dms.map((chat) => chat.lastMessage?.content).filter((content) => content !== undefined)
    ).toEqual(
        expect.arrayContaining([
            expect.stringContaining('Which of the three stale strings should I fix first?'),
            'Sounds right — badge PR first, then the reminders.',
        ])
    );
    expect(dms.every((chat) => chat.unreadCount > 0 || chat.lastMessage === null)).toBe(true);
});

test('Unread holds Tiny’s DM question; the claim is on Tasks', async () => {
    const agents = await owner.trpc.agent.list.query({ serverId });
    const agentId = (handle: string) => agents.find((agent) => agent.handle === handle)?.id;
    const chats = await owner.trpc.chat.list.query({ serverId });
    const tiny = chats.find((chat) => chat.peerAgentId === agentId('tiny'));
    expect(tiny?.unreadCount).toBeGreaterThan(0);
    expect(tiny?.lastMessage?.content).toContain(
        'Which of the three stale strings should I fix first?'
    );

    const blippyId = agents.find((agent) => agent.handle === 'blippy')?.id;
    const { tasks } = await owner.trpc.task.list.query({ includeBackground: false, serverId });
    const claims = tasks.filter(
        (item) => item.task.origin === 'claimed' && item.task.assigneeAgentId === blippyId
    );

    expect(claims).toHaveLength(1);
    expect(claims[0]?.task).toMatchObject({
        assigneeAgentId: blippyId,
        live: false,
        status: 'in_progress',
        tier: 'tracked',
    });
    expect(claims[0]?.message.content).toContain('Reminders on the weekly digest fired twice');
});

// No running Cloud Agent work is seeded: Computer would reconcile a fake run
// against the provider every minute and wedge the Server's connection pool.
test('Happening now shows gallery samples and settled work keeps its evidence', async () => {
    const active = await owner.trpc.cloudAgentWork.listActive.query({ serverId });
    // Five gallery samples plus the seven running #repo-health fan-out rows.
    expect(active).toHaveLength(12);

    const chats = await owner.trpc.chat.list.query({ serverId });
    const productChatId = chats.find((chat) => chat.name === 'product')?.id ?? '';
    const chatWork = await owner.trpc.cloudAgentWork.listForChat.query({
        chatId: productChatId,
        serverId,
    });
    const settled = chatWork.find((entry) => entry.work.title === 'Sidebar Inbox badge');

    expect(chatWork).toHaveLength(1);
    expect(settled?.work).toMatchObject({
        provider: 'cursor',
        repository: 'zknicker/haus',
        status: 'completed',
    });
    expect(settled?.work.runs[0]?.branches[0]).toMatchObject({
        branch: 'cloud/sidebar-inbox-badge',
        pullRequestUrl: 'https://github.com/zknicker/haus/pull/482',
    });
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
    expect(turnsByHandle.get('blippy')).toBe(13);
    expect(turnsByHandle.get('tiny')).toBe(9);
    expect(turnsByHandle.get('cove')).toBe(2);

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
    const again = await seedDevelopmentServer(database.db, clerkUserId);

    expect(again.id).toBe(serverId);
    expect(await countActivity()).toEqual(before);
});

async function countActivity() {
    const [counts] = (await harness.sql`
        select
            (select count(*) from chat_messages where server_id = ${serverId}) as messages,
            (select count(*) from message_tasks where server_id = ${serverId}) as tasks,
            (select count(*) from cloud_agent_work where server_id = ${serverId}) as work,
            (select count(*) from cloud_agent_runs where server_id = ${serverId}) as runs,
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

test('UI gallery reads the attachment combinations and isolates live samples', async () => {
    const chats = await owner.trpc.chat.list.query({ serverId });
    const gallery = chats.find((chat) => chat.name === 'ui-gallery');
    expect(gallery).toBeDefined();
    const chatId = gallery?.id ?? '';
    const transcript = await owner.trpc.chat.messages.query({ serverId, chatId });
    expect(transcript.messages).toHaveLength(24);
    expect(
        transcript.messages.filter((message) => message.content.includes('user://'))
    ).toHaveLength(4);
    const works = await owner.trpc.cloudAgentWork.listForChat.query({ serverId, chatId });
    expect(works).toHaveLength(11);
    expect([...new Set(works.map((entry) => entry.work.status))].sort()).toEqual([
        'cancelled',
        'completed',
        'expired',
        'failed',
        'queued',
        'running',
    ]);
    const [onboarding] =
        await harness.sql`select computer_id from server_onboarding where server_id = ${serverId}`;
    expect(
        await listComputerCloudAgentWork(database.db, {
            serverId,
            computerId: onboarding.computer_id,
        })
    ).toEqual([]);
    const active = works.filter(
        (entry) => entry.work.status === 'running' || entry.work.status === 'queued'
    );
    expect(active).toHaveLength(5);
    expect(active.every((entry) => entry.work.computerId !== onboarding.computer_id)).toBe(true);
    expect(works.every((entry) => entry.work.providerUrl === null)).toBe(true);
});
