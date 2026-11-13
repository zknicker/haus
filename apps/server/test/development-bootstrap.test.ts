import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import { openAttachmentRoot } from '../src/attachments/attachment-root.ts';
import { readMessageCauses } from '../src/automations/message-cause-read.ts';
import { developmentArtifactFiles } from '../src/development/seed-artifact-files.ts';
import { seedDevelopmentServer } from '../src/development/seed-server.ts';
import { readPendingCoveCommand } from '../src/onboarding/create-cove.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import {
    agentsTable,
    attachmentsTable,
    avatarsTable,
    boardsTable,
    chatMessagesTable,
    chatsTable,
    computersTable,
    mcpConnectionsTable,
    messageClaimsTable,
    serverOnboardingTable,
    serversTable,
    taskInboxItemsTable,
    taskMessageLinksTable,
    tasksTable,
    threadFollowsTable,
    usersTable,
} from '../src/postgres/schema.ts';
import { makeServerRuntime } from '../src/server-runtime.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

let cluster: PostgresCluster;
let connection: HausConnection;
const runtime = makeServerRuntime();

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
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
    expect(agents).toHaveLength(3);
    // Base workspace, the UI gallery channel and its threads, #automations,
    // and #repo-health with its Cloud Agent fan-out Thread. The gallery's three
    // follow-up works, its pending-input sample, its five Claude provider samples,
    // and two inline-mention samples each carry a Thread. #shop holds the heartbeat reports' posts.
    expect(await connection.db.select().from(chatsTable)).toHaveLength(40);
    expect(await connection.db.select().from(serverOnboardingTable)).toMatchObject([
        {
            agentId: agents.find((agent) => agent.handle === 'cove')?.id,
            modelId: 'gpt-5.6-terra',
            phase: 'applying',
            runtimeId: 'codex',
            serverId: first.id,
        },
    ]);
    // #repo-health adds its anchor and nine Cloud Agent work Messages; the
    // gallery's three follow-up works, pending-input sample, and five Claude
    // provider samples add one Message each; inline mentions add six messages;
    // #shop adds the owner's line and three posts.
    expect(await connection.db.select().from(chatMessagesTable)).toHaveLength(96);
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
    const onboardingComputerId = (await connection.db.select().from(serverOnboardingTable))[0]
        ?.computerId;
    const computer = (await connection.db.select().from(computersTable)).find(
        (row) => row.id === onboardingComputerId
    );
    const computerAttachment = JSON.parse(
        await readFile(join(computerDataRoot, 'servers', first.id, 'attachment.json'), 'utf8')
    ) as { computerId: string; serverOrigin: string };
    expect(computerAttachment).toMatchObject({
        computerId: computer?.id,
        serverOrigin: 'http://127.0.0.1:43210',
    });
    expect(await readPendingCoveCommand(connection.db, computer?.id ?? '')).toMatchObject({
        agentDescription: 'Onboarding Assistant',
        agentId: agents.find((agent) => agent.handle === 'cove')?.id,
        agentName: 'Cove',
        factoryKind: 'cove',
        modelId: 'gpt-5.6-terra',
        runtimeId: 'codex',
        type: 'cove-apply',
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
    const threads = (await connection.db.select().from(chatsTable)).filter(
        (chat) => chat.kind === 'thread'
    );
    const claims = await connection.db.select().from(messageClaimsTable);
    const users = await connection.db.select().from(usersTable);

    // Every Agent is attributed, so the human's Created Agents is populated.
    expect(agents.every((agent) => agent.createdByUserId !== null)).toBe(true);
    expect(agents.map((agent) => agent.displayName).sort()).toEqual(['Blippy', 'Cove', 'Tiny']);
    expect(agents.find((agent) => agent.handle === 'cove')).toMatchObject({
        description: 'Onboarding Assistant',
        desiredModelId: 'gpt-5.6-terra',
        desiredRuntimeId: 'codex',
        factoryAppliedAt: null,
        factoryKind: 'cove',
    });

    // Nothing in the demo workspace falls back to initials.
    expect(agents.every((agent) => agent.avatarId !== null)).toBe(true);
    expect(users.every((user) => user.avatarId !== null)).toBe(true);
    expect(await connection.db.select().from(avatarsTable)).toHaveLength(4);

    const allChannelId = (await connection.db.select().from(chatsTable)).find(
        (chat) => chat.isAll
    )?.id;
    // Threads are anchored to real channel messages; three are followed.
    // Includes the #repo-health fan-out Thread, the gallery's follow-up works,
    // its pending-input sample, five Claude provider samples, and two inline-mention samples.
    expect(threads).toHaveLength(30);
    expect(threads.every((thread) => thread.anchorMessageId && thread.parentChatId)).toBe(true);
    expect(await connection.db.select().from(threadFollowsTable)).toHaveLength(3);

    // The General board's demo Tasks, each mentioned by the message it came from.
    // The two handed to the owner are Inbox items; one's context is a Thread
    // reply, and each message names its Task, so the chip shows. The board's
    // counter is past them, so the first real Task does not collide with a
    // seeded number.
    const tasks = await connection.db.select().from(tasksTable);
    const links = await connection.db.select().from(taskMessageLinksTable);
    expect(tasks.map((task) => task.number).sort()).toEqual([1, 2, 3, 4]);
    expect(links.map((link) => link.text).sort()).toEqual(['GEN-1', 'GEN-2', 'GEN-3', 'GEN-4']);
    const [general] = await connection.db.select().from(boardsTable);
    expect(general).toMatchObject({ key: 'GEN', nextNumber: 5 });
    const inboxItems = await connection.db.select().from(taskInboxItemsTable);
    const ownerTasks = tasks.filter((task) => task.assigneeUserId !== null);
    expect(ownerTasks.map((task) => task.number).sort()).toEqual([3, 4]);
    expect(inboxItems.map((item) => item.taskId).sort()).toEqual(
        ownerTasks.map((task) => task.id).sort()
    );
    expect(inboxItems.every((item) => item.assignedByAgentId !== null)).toBe(true);
    const linkedMessages = await connection.db
        .select({ chatKind: chatsTable.kind, content: chatMessagesTable.content })
        .from(chatMessagesTable)
        .innerJoin(chatsTable, eq(chatsTable.id, chatMessagesTable.chatId))
        .where(
            inArray(
                chatMessagesTable.id,
                links.filter((link) => /GEN-[34]/u.test(link.text)).map((link) => link.messageId)
            )
        );
    expect(linkedMessages.map((message) => message.chatKind).sort()).toEqual(['channel', 'thread']);
    expect(linkedMessages.every((message) => /GEN-[34]/u.test(message.content))).toBe(true);

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
        'Stale Thread Cleanup',
    ]);
    expect(reminderCauses.every((cause) => (cause.description?.length ?? 0) > 30)).toBe(true);
    // One reminder answer is also an inline reply; its cause line replaces the reply line.
    expect(caused.filter((cause) => cause.reply !== null)).toHaveLength(1);
    // And one plain reply to compare against.
    expect(
        messages.filter((message) => message.replyToMessageId && !causes.has(message.id))
    ).toHaveLength(1);
});
