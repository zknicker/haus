import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openAttachmentRoot } from '../src/attachments/attachment-root.ts';
import { readMessageCauses } from '../src/automations/message-cause-read.ts';
import { developmentArtifactFiles } from '../src/development/seed-artifact-files.ts';
import { seedDevelopmentServer } from '../src/development/seed-server.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import {
    agentsTable,
    attachmentsTable,
    avatarsTable,
    chatMessagesTable,
    chatsTable,
    workersTable,
    computersTable,
    mcpConnectionsTable,
    messageClaimsTable,
    projectsTable,
    serversTable,
    taskFollowsTable,
    taskKeysTable,
    taskMessageLinksTable,
    taskPullRequestsTable,
    tasksTable,
    usersTable,
} from '../src/postgres/schema.ts';
import { makeServerRuntime } from '../src/server-runtime.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';

let cluster: TestDatabase;
let connection: HausConnection;
const runtime = makeServerRuntime();

beforeAll(async () => {
    cluster = await startMigratedDatabase();
    connection = await connectHausDatabase(cluster.databaseUrl);
});

afterAll(async () => {
    await connection?.close();
    await cluster?.stop();
    await runtime.dispose();
});

test('creates one idempotent Server-owned demo workspace', async () => {
    const computerDataRoot = await mkdtemp(join(tmpdir(), 'haus-dev-computer-'));
    const attachmentRoot = await openAttachmentRoot(join(computerDataRoot, 'attachments'), runtime);
    const options = {
        attachmentRoot,
        computerDataRoot,
        serverOrigin: 'http://127.0.0.1:43210',
    };
    const userId = 'usr_dev_bootstrap';
    await connection.db.insert(usersTable).values({
        authSubject: 'test:dev-bootstrap',
        id: userId,
    });
    const first = await seedDevelopmentServer(connection.db, userId, options);
    const second = await seedDevelopmentServer(connection.db, userId, options);

    expect(second).toEqual(first);
    expect(await connection.db.select().from(serversTable)).toHaveLength(1);
    expect(await connection.db.select().from(computersTable)).toHaveLength(2);
    const agents = await connection.db.select().from(agentsTable);
    expect(agents).toHaveLength(2);
    expect(await connection.db.select().from(chatsTable)).toHaveLength(11);
    expect(await connection.db.select().from(chatMessagesTable)).toHaveLength(91);
    const [seededAttachment] = await connection.db.select().from(attachmentsTable);
    expect(seededAttachment).toMatchObject({
        byteSize: 163_552,
        filename: 'cove-avatar-experiment.png',
        mediaType: 'image/png',
        messagePosition: 0,
        serverId: first.id,
        sha256: 'f7a623712e1befb23972019a63df7f3fb5c7e890779031ccc29160fa88442d94',
        state: 'ready',
    });
    if (!seededAttachment) {
        throw new Error('Expected the development image attachment to exist.');
    }
    const attachmentFile = await attachmentRoot.openObject(first.id, seededAttachment.id);
    const attachmentBytes = await attachmentFile.readFile();
    await attachmentFile.close();
    expect(attachmentBytes.byteLength).toBe(163_552);
    expect(createHash('sha256').update(attachmentBytes).digest('hex')).toBe(
        seededAttachment.sha256
    );
    const blippyComputerId = agents.find((agent) => agent.handle === 'blippy')?.computerId;
    const computerAttachment = JSON.parse(
        await readFile(join(computerDataRoot, 'servers', first.id, 'attachment.json'), 'utf8')
    ) as { computerId: string; serverOrigin: string };
    expect(computerAttachment).toMatchObject({
        computerId: blippyComputerId,
        serverOrigin: 'http://127.0.0.1:43210',
    });
    // Blippy shares real workspace artifacts in #product, once, with the
    // channel's sequence still matching its latest message.
    const blippy = agents.find((agent) => agent.handle === 'blippy');
    const product = (await connection.db.select().from(chatsTable)).find(
        (chat) => chat.name === 'product'
    );
    const artifactMessages = (await connection.db.select().from(chatMessagesTable)).filter(
        (message) => message.nonce === 'dev-artifact-tabs'
    );
    expect(artifactMessages).toMatchObject([
        { authorAgentId: blippy?.id, chatId: product?.id, sequence: 3 },
    ]);
    expect(artifactMessages[0]?.content).toContain(
        `haus://workspace/${developmentArtifactFiles.notes.path}`
    );
    expect(artifactMessages[0]?.content).toContain('```page');
    expect(product?.lastMessageSequence).toBe(
        Math.max(
            ...(await connection.db.select().from(chatMessagesTable))
                .filter((message) => message.chatId === product?.id)
                .map((message) => message.sequence)
        )
    );
    const workspace = join(
        computerDataRoot,
        'servers',
        first.id,
        'agents',
        blippy?.id ?? '',
        'workspace'
    );
    for (const file of Object.values(developmentArtifactFiles)) {
        expect(await readFile(join(workspace, file.path), 'utf8')).toBe(file.content);
    }
    await rm(computerDataRoot, { force: true, recursive: true });
});

// The workspace seeded above is the one an operator opens; assert it carries
// enough to exercise every surface without hand-building data.
test('seeds a demo workspace an operator can actually look at', async () => {
    const agents = await connection.db.select().from(agentsTable);
    const claims = await connection.db.select().from(messageClaimsTable);
    const users = await connection.db.select().from(usersTable);

    // Every Agent is attributed, so the human's Created Agents is populated.
    expect(agents.every((agent) => agent.createdByUserId !== null)).toBe(true);
    expect(agents.map((agent) => agent.displayName).sort()).toEqual(['Blippy', 'Tiny']);
    expect(
        (await connection.db.select().from(chatsTable)).some(
            (chat) => chat.name === 'onboarding-owner'
        )
    ).toBe(false);

    // Nothing in the demo workspace falls back to initials.
    expect(agents.every((agent) => agent.avatarId !== null)).toBe(true);
    expect(users.every((user) => user.avatarId !== null)).toBe(true);
    expect(await connection.db.select().from(avatarsTable)).toHaveLength(3);

    const allChannelId = (await connection.db.select().from(chatsTable)).find(
        (chat) => chat.isAll
    )?.id;
    const messages = await connection.db.select().from(chatMessagesTable);
    const planReplies = messages.filter(
        (message) => message.chatId === allChannelId && message.replyToMessageId !== null
    );
    expect(planReplies).toHaveLength(3);
    expect(new Set(planReplies.map((message) => message.replyRootMessageId)).size).toBe(1);
    const follows = await connection.db.select().from(taskFollowsTable);
    const tasks = await connection.db.select().from(tasksTable);
    const links = await connection.db.select().from(taskMessageLinksTable);
    const states = byNumber(tasks).map((task) => `${task.number}:${task.state}`);
    expect(states.join(' ')).toBe('1:open 2:todo 3:todo 4:todo 5:done');
    expect(tasks.every((task) => task.chatId !== null)).toBe(true);
    const keys = links.map((link) => link.text).sort();
    expect(keys.join(' ')).toBe('GEN-1 GEN-2 GEN-3 GEN-4 GEN-5');
    const ledger = await connection.db.select().from(taskKeysTable);
    expect(ledger.map((entry) => `${entry.key}:${entry.nextNumber}`).sort()).toEqual(['GEN:6']);
    const productId = (await connection.db.select().from(chatsTable)).find(
        (chat) => chat.name === 'product'
    )?.id;
    const projects = await connection.db.select().from(projectsTable);
    expect(projects.map((project) => project.chatId)).toEqual([productId]);
    expect(agents.every((agent) => agent.homeProjectId === productId)).toBe(true);
    expect(tasks.every((task) => task.projectId === productId)).toBe(true);
    const ownerTasks = tasks.filter((task) => task.assigneeUserId !== null);
    expect(ownerTasks.map((task) => task.number).sort()).toEqual([3, 4]);
    const followed = new Set(follows.map((follow) => follow.taskChatId));
    const followedNumbers = tasks.filter((task) => followed.has(task.chatId ?? ''));
    expect(followedNumbers.map((task) => task.number).sort()).toEqual([1, 3, 4, 5]);
    const [open] = byNumber(tasks);
    expect(messages.filter((message) => message.chatId === open?.chatId)).toHaveLength(4);
    const works = await connection.db.select().from(workersTable);
    const openWork = works.filter((work) => work.taskId === open?.id);
    expect(openWork.map((work) => work.status)).toEqual(['completed']);
    expect(await connection.db.select().from(taskPullRequestsTable)).toMatchObject([
        { number: 512, repository: 'zknicker/haus', taskId: open?.id },
    ]);
    const named = links
        .filter((link) => /GEN-[34]/u.test(link.text))
        .map((link) => messages.find((message) => message.id === link.messageId));
    expect(named.every((message) => message && /GEN-[34]/u.test(message.content))).toBe(true);
    const inTask = named.some((message) => tasks.some((task) => task.chatId === message?.chatId));
    expect(inTask).toBe(false);

    // The Inbox seed's stalled claim is the only one in `#all`. The channel's
    // counter is past it, so promoting a message there does not collide with a
    // seeded claim number.
    expect(claims).toHaveLength(11);
    const [allChannel] = (await connection.db.select().from(chatsTable)).filter(
        (chat) => chat.isAll
    );
    expect(allChannel?.lastClaimNumber).toBe(
        Math.max(
            ...claims.filter((claim) => claim.chatId === allChannelId).map((claim) => claim.number)
        )
    );
    expect(
        claims
            .filter((claim) => claim.chatId === allChannelId)
            .map((claim) => claim.status)
            .sort()
    ).toEqual(['in_progress']);
    // Claims are Agent work (ADR 0037): every seeded claim is held by an Agent.
    expect(claims.every((claim) => claim.assigneeAgentId !== null)).toBe(true);

    // A Server-managed connection the Agent Connections surface can grant.
    expect(await connection.db.select().from(mcpConnectionsTable)).toHaveLength(1);
});

test('seeds #automations with live, archived, and replying automation causes', async () => {
    const chats = await connection.db.select().from(chatsTable);
    const channel = chats.find((chat) => chat.name === 'automations');
    expect(channel).toBeDefined();
    const messages = (await connection.db.select().from(chatMessagesTable))
        .filter((message) => message.chatId === channel?.id)
        .sort((left, right) => left.sequence - right.sequence);
    const causes = await readMessageCauses(
        connection.db,
        channel?.serverId ?? '',
        messages.map((message) => message.id)
    );

    const caused = messages.flatMap((message) => {
        const cause = causes.get(message.id);
        return cause
            ? [{ kind: cause.kind, live: cause.live !== null, reply: message.replyToMessageId }]
            : [];
    });
    expect(caused.map(({ kind, live }) => [kind, live])).toEqual([
        ['reminder', true],
        ['reminder', true],
        ['trigger', true],
        ['reminder', false],
    ]);
    // Reminder lines read as short labels; the full instruction rides the description.
    const reminderCauses = [...causes.values()].filter((cause) => cause.kind === 'reminder');
    expect(reminderCauses.map((cause) => cause.title).sort()).toEqual([
        'Monday Release Checklist',
        'Review Queue Check',
        'Stale Channel Cleanup',
    ]);
    expect(reminderCauses.every((cause) => (cause.description?.length ?? 0) > 30)).toBe(true);
    // One reminder answer is also an inline reply; its cause line replaces the reply line.
    expect(caused.filter((cause) => cause.reply !== null)).toHaveLength(1);
    // And one plain reply to compare against.
    expect(
        messages.filter((message) => message.replyToMessageId && !causes.has(message.id))
    ).toHaveLength(1);
});

function byNumber<T extends { number: number }>(rows: T[]): T[] {
    return [...rows].sort((left, right) => left.number - right.number);
}
