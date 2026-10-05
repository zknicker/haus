import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    chatMessagesTable,
    chatsTable,
    computersTable,
    mcpConnectionsTable,
    messageTasksTable,
    serverOnboardingTable,
    serversTable,
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
    const first = await seedDevelopmentServer(connection.db, 'clerk_dev', options);
    const second = await seedDevelopmentServer(connection.db, 'clerk_dev', options);

    expect(second).toEqual(first);
    expect(await connection.db.select().from(serversTable)).toHaveLength(1);
    expect(await connection.db.select().from(computersTable)).toHaveLength(2);
    const agents = await connection.db.select().from(agentsTable);
    expect(agents).toHaveLength(3);
    // Base workspace, the UI gallery channel and its threads, and #automations.
    expect(await connection.db.select().from(chatsTable)).toHaveLength(26);
    expect(await connection.db.select().from(serverOnboardingTable)).toMatchObject([
        {
            agentId: agents.find((agent) => agent.handle === 'cove')?.id,
            modelId: 'gpt-5.6-terra',
            phase: 'applying',
            runtimeId: 'codex',
            serverId: first.id,
        },
    ]);
    expect(await connection.db.select().from(chatMessagesTable)).toHaveLength(67);
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
    expect(artifactMessages[0]?.content).toContain('```artifact');
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
    const tasks = await connection.db.select().from(messageTasksTable);
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
    // Threads are anchored to real channel messages, and one is followed.
    expect(threads).toHaveLength(18);
    expect(threads.every((thread) => thread.anchorMessageId && thread.parentChatId)).toBe(true);
    expect(await connection.db.select().from(threadFollowsTable)).toHaveLength(1);

    // Every promoted task carries its deterministic Thread. A claim does not:
    // the Thread is materialized when somebody first replies in it, which is
    // exactly what the seeded stalled claim never got.
    const threadIds = new Set(threads.map((thread) => thread.id));
    expect(
        tasks
            .filter((task) => task.chatId === allChannelId && task.origin !== 'claimed')
            .every((task) => threadIds.has(`cht_thr_${task.messageId.replace(/^msg_/u, '')}`))
    ).toBe(true);

    // Two Agent-held promoted tasks in two statuses, plus
    // the Inbox seed's stalled claim. The channel's counter is past all of
    // them, so promoting a message in the seeded `#all` does not collide with
    // a seeded task number.
    expect(tasks).toHaveLength(13);
    const [allChannel] = (await connection.db.select().from(chatsTable)).filter(
        (chat) => chat.isAll
    );
    expect(allChannel?.lastTaskNumber).toBe(
        Math.max(...tasks.filter((task) => task.chatId === allChannelId).map((task) => task.number))
    );
    expect(
        tasks
            .filter((task) => task.chatId === allChannelId)
            .map((task) => task.status)
            .sort()
    ).toEqual(['in_progress', 'in_progress', 'todo']);
    // Tasks are Agent work (ADR 0037): every seeded task is held by an Agent.
    expect(tasks.every((task) => task.assigneeAgentId !== null)).toBe(true);

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
    // The stacked case: one reminder answer is also an inline reply.
    expect(caused.filter((cause) => cause.reply !== null)).toHaveLength(1);
    // And one plain reply to compare against.
    expect(
        messages.filter((message) => message.replyToMessageId && !causes.has(message.id))
    ).toHaveLength(1);
});
