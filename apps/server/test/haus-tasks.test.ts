import { afterAll, beforeAll, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let owner: HausClient;

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = createHausClient(harness, await harness.clerk.mintSessionToken('user_task_owner'));
});

afterAll(async () => {
    owner.close();
    await harness.close();
});

test('promotes one canonical Server message into its deterministic Thread work surface', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Task Server',
        slug: 'task-server',
    });
    const chatId = server.channels[0].id;
    const sent = await owner.trpc.chat.send.mutate({
        chatId,
        content: 'Audit the Server export',
        nonce: 'task-promote-message',
        serverId: server.id,
    });

    const promoted = await owner.trpc.task.promote.mutate({
        messageId: sent.message.id,
        serverId: server.id,
    });
    const replayed = await owner.trpc.task.promote.mutate({
        messageId: sent.message.id,
        serverId: server.id,
    });

    expect(promoted).toMatchObject({
        idempotent: false,
        task: {
            chatId,
            messageId: sent.message.id,
            number: 1,
            status: 'todo',
            threadChatId: `cht_thr_${sent.message.id.slice('msg_'.length)}`,
            version: 1,
        },
    });
    expect(replayed).toEqual({ ...promoted, idempotent: true });
    const promotionEvents = await owner.trpc.chat.events.query({
        afterCursor: sent.eventCursor,
        serverId: server.id,
    });
    expect(promotionEvents.map(({ messageId, type }) => ({ messageId, type }))).toEqual([
        { messageId: sent.message.id, type: 'task.created' },
    ]);
    const { tasks } = await owner.trpc.task.list.query({ serverId: server.id });
    expect(tasks).toMatchObject([
        {
            message: { content: 'Audit the Server export', id: sent.message.id },
            task: { messageId: sent.message.id, number: 1 },
        },
    ]);
    // Promotion only derives the Thread id: the first reply creates the Thread.
    const promotedThread = (await harness.sql`
        select id from chats where server_id = ${server.id} and id = ${promoted.task.threadChatId}
    `) as { id: string }[];
    expect(promotedThread).toEqual([]);
    const promotionMessages = await owner.trpc.chat.messages.query({ chatId, serverId: server.id });
    expect(promotionMessages.messages).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                id: sent.message.id,
                task: expect.objectContaining({
                    messageId: sent.message.id,
                    number: 1,
                    status: 'todo',
                }),
            }),
        ])
    );
    const promotionAuthors = promotionMessages.messages.map((message) => message.author.kind);
    expect(promotionAuthors).not.toContain('system');
});

test('does not promote a Thread reply into human work', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Untaskable Thread Reply',
        slug: 'untaskable-thread-reply',
    });
    const chatId = server.channels[0].id;
    const anchor = await owner.trpc.chat.send.mutate({
        chatId,
        content: 'Anchor for the reply',
        nonce: 'untaskable-thread-anchor',
        serverId: server.id,
    });
    const reply = await owner.trpc.chat.send.mutate({
        chatId,
        content: 'A reply is not a task',
        nonce: 'untaskable-thread-reply',
        serverId: server.id,
        thread: { anchorMessageId: anchor.message.id },
    });

    await expect(
        owner.trpc.task.promote.mutate({
            messageId: reply.message.id,
            serverId: server.id,
        })
    ).rejects.toThrow(/human or Agent messages.*top-level Channel or DM/i);
});

test('creates a task-message atomically and replays the same nonce idempotently', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Task Create',
        slug: 'task-create',
    });
    const chatId = server.channels[0].id;
    const input = {
        chatId,
        content: 'Ship the task lane',
        nonce: 'task-create-once',
        serverId: server.id,
    };

    const created = await owner.trpc.task.create.mutate(input);
    const replayed = await owner.trpc.task.create.mutate(input);

    expect(created).toMatchObject({
        idempotent: false,
        task: { messageId: created.task.messageId, number: 1, origin: 'composed' },
    });
    expect(replayed).toEqual({ ...created, idempotent: true });
    const createdList = await owner.trpc.task.list.query({ serverId: server.id });
    expect(createdList.tasks).toHaveLength(1);
    const creationEvents = await owner.trpc.chat.events.query({
        afterCursor: '0',
        serverId: server.id,
    });
    expect(creationEvents.map(({ messageId, type }) => ({ messageId, type }))).toEqual([
        { messageId: created.task.messageId, type: 'message.created' },
        { messageId: created.task.messageId, type: 'task.created' },
    ]);
    const creationMessages = await owner.trpc.chat.messages.query({ chatId, serverId: server.id });
    expect(creationMessages.messages).toHaveLength(1);
    expect(creationMessages.messages[0]?.id).toBe(created.task.messageId);
});

test('lists the task Thread summary and DM peer identity', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Task Thread Summary',
        slug: 'task-thread-summary',
    });
    const peer = await addTaskPeer(server.id, server.channels[0].id);
    const dm = await owner.trpc.chat.ensureDm.mutate({
        peerUserId: peer.userId,
        serverId: server.id,
    });
    const created = await owner.trpc.task.create.mutate({
        chatId: dm.id,
        content: 'Discuss this privately',
        nonce: 'task-thread-summary-create',
        serverId: server.id,
    });
    await owner.trpc.chat.send.mutate({
        chatId: dm.id,
        content: 'First task reply',
        nonce: 'task-thread-summary-reply',
        serverId: server.id,
        thread: { anchorMessageId: created.task.messageId },
    });
    await owner.trpc.thread.setFollow.mutate({
        follow: false,
        serverId: server.id,
        threadChatId: created.task.threadChatId,
    });

    const listed = await owner.trpc.task.list.query({ serverId: server.id });
    expect(listed.tasks).toMatchObject([
        {
            chatKind: 'dm',
            chatName: null,
            chatPeerUserId: peer.userId,
            threadSummary: {
                anchorMessageId: created.task.messageId,
                followed: false,
                replyCount: 1,
                threadChatId: created.task.threadChatId,
            },
        },
    ]);
    peer.client.close();
});

test('rejects task creation in a Thread as a bad request', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Task Thread Create',
        slug: 'task-thread-create',
    });
    const chatId = server.channels[0].id;
    const created = await owner.trpc.task.create.mutate({
        chatId,
        content: 'Parent task',
        nonce: 'task-thread-parent',
        serverId: server.id,
    });
    // The Thread has to exist before it can be refused as a task's parent Chat.
    await owner.trpc.chat.send.mutate({
        chatId,
        content: 'First reply',
        nonce: 'task-thread-first-reply',
        serverId: server.id,
        thread: { anchorMessageId: created.task.messageId },
    });

    await expect(
        owner.trpc.task.create.mutate({
            chatId: created.task.threadChatId,
            content: 'Nested task',
            nonce: 'task-thread-nested',
            serverId: server.id,
        })
    ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });
});

test('maps task creation by an unknown Haus User to not found', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Task Unknown User',
        slug: 'task-unknown-user',
    });
    const stranger = createHausClient(
        harness,
        await harness.clerk.mintSessionToken('user_task_stranger')
    );

    await expect(
        stranger.trpc.task.create.mutate({
            chatId: server.channels[0].id,
            content: 'Invisible task',
            nonce: 'task-unknown-user-create',
            serverId: server.id,
        })
    ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
    stranger.close();
});

test('a human is never a task assignee', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Task Human Assignee',
        slug: 'task-human-assignee',
    });
    const chatId = server.channels[0].id;
    const peer = await addTaskPeer(server.id, chatId);
    const agent = await addTaskAgent(server.id, chatId);
    const created = await owner.trpc.task.create.mutate({
        chatId,
        content: 'Only Agents hold tasks',
        nonce: 'task-human-assignee',
        serverId: server.id,
    });

    // Tasks are Agent work (ADR 0037): the wire has no human assignee shape.
    await expect(
        owner.trpc.task.create.mutate({
            assigneeUserId: peer.userId,
            chatId,
            content: 'Reserve this for a human',
            nonce: 'task-human-assignee-create',
            serverId: server.id,
        } as never)
    ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });
    await expect(
        owner.trpc.task.assign.mutate({
            assignee: { kind: 'human', userId: peer.userId },
            expectedVersion: created.task.version,
            messageId: created.task.messageId,
            serverId: server.id,
        } as never)
    ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });
    // A human id where an Agent id belongs is not an active Agent.
    await expect(
        owner.trpc.task.assign.mutate({
            assignee: { agentId: peer.userId },
            expectedVersion: created.task.version,
            messageId: created.task.messageId,
            serverId: server.id,
        })
    ).rejects.toThrow(/active Agent/iu);

    // The picker offers the Chat's Agents and no humans.
    await expect(
        peer.client.trpc.task.assignees.query({
            messageId: created.task.messageId,
            serverId: server.id,
        })
    ).resolves.toEqual([
        { agentId: agent.agentId, avatarUrl: null, displayName: 'Ada', handle: agent.handle },
    ]);
    peer.client.close();
});

test('any Chat member assigns an Agent, and an owner unassigns without moving status', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Task Assignment',
        slug: 'task-assignment',
    });
    const chatId = server.channels[0].id;
    const peer = await addTaskPeer(server.id, chatId);
    const agent = await addTaskAgent(server.id, chatId);
    const created = await owner.trpc.task.create.mutate({
        chatId,
        content: 'Reserve this task',
        nonce: 'task-assignment-message',
        serverId: server.id,
    });
    const started = await owner.trpc.task.update.mutate({
        expectedVersion: created.task.version,
        messageId: created.task.messageId,
        patch: { status: 'in_review' },
        serverId: server.id,
    });

    // Assigning is member-level, not an admin power.
    const assigned = await peer.client.trpc.task.assign.mutate({
        assignee: { agentId: agent.agentId },
        expectedVersion: started.task.version,
        messageId: created.task.messageId,
        serverId: server.id,
    });
    expect(assigned.task).toMatchObject({
        assigneeAgentId: agent.agentId,
        claimedAt: null,
        status: 'in_review',
        version: 3,
    });

    const unassigned = await owner.trpc.task.assign.mutate({
        assignee: null,
        expectedVersion: assigned.task.version,
        messageId: created.task.messageId,
        serverId: server.id,
    });
    expect(unassigned.task).toMatchObject({
        assigneeAgentId: null,
        claimedAt: null,
        status: 'in_review',
        version: 4,
    });
    peer.client.close();
});

test('serializes competing Agent assignments at one expected task version', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Task Reservation Race',
        slug: 'task-reservation-race',
    });
    const chatId = server.channels[0].id;
    const first = await addTaskAgent(server.id, chatId);
    const second = await addTaskAgent(server.id, chatId);
    const created = await owner.trpc.task.create.mutate({
        chatId,
        content: 'Reserve for exactly one Agent',
        nonce: 'task-reservation-race',
        serverId: server.id,
    });

    const reservations = await Promise.allSettled(
        [first, second].map((agent) =>
            owner.trpc.task.assign.mutate({
                assignee: { agentId: agent.agentId },
                expectedVersion: created.task.version,
                messageId: created.task.messageId,
                serverId: server.id,
            })
        )
    );

    expect(reservations.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(reservations.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const [reserved] = (await owner.trpc.task.list.query({ serverId: server.id })).tasks;
    expect([first.agentId, second.agentId]).toContain(reserved.task.assigneeAgentId);
    expect(reserved.task.version).toBe(2);
});

test('updates status, priority, and task-specific Server labels with expected versions', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Task Metadata',
        slug: 'task-metadata',
    });
    const chatId = server.channels[0].id;
    const peer = await addTaskPeer(server.id, chatId);
    const created = await owner.trpc.task.create.mutate({
        chatId,
        content: 'Review task metadata',
        nonce: 'task-metadata-message',
        serverId: server.id,
    });
    const label = await peer.client.trpc.taskLabel.create.mutate({
        name: 'backend',
        serverId: server.id,
    });

    const updated = await peer.client.trpc.task.update.mutate({
        expectedVersion: created.task.version,
        messageId: created.task.messageId,
        patch: {
            labelIds: [label.label?.id as string],
            priority: 'high',
            status: 'in_review',
        },
        serverId: server.id,
    });
    expect(updated.task).toMatchObject({
        labels: [{ id: label.label?.id, name: 'backend' }],
        priority: 'high',
        status: 'in_review',
        version: 2,
    });
    await expect(
        owner.trpc.task.update.mutate({
            expectedVersion: created.task.version,
            messageId: created.task.messageId,
            patch: { status: 'done' },
            serverId: server.id,
        })
    ).rejects.toThrow(/changed|refresh/i);
    peer.client.close();
});

test('keeps task-label management Server-scoped and admin-controlled', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Task Labels',
        slug: 'task-labels',
    });
    const peer = await addTaskPeer(server.id, server.channels[0].id);
    const created = await peer.client.trpc.taskLabel.create.mutate({
        name: 'needs-review',
        serverId: server.id,
    });

    await expect(
        peer.client.trpc.taskLabel.update.mutate({
            color: 'purple',
            labelId: created.label?.id as string,
            serverId: server.id,
        })
    ).rejects.toThrow(/admin|owner/i);
    const renamed = await owner.trpc.taskLabel.update.mutate({
        color: 'purple',
        labelId: created.label?.id as string,
        name: 'review',
        serverId: server.id,
    });
    expect(renamed.label).toMatchObject({ color: 'purple', name: 'review' });
    await owner.trpc.taskLabel.delete.mutate({
        labelId: created.label?.id as string,
        serverId: server.id,
    });
    await expect(owner.trpc.taskLabel.list.query({ serverId: server.id })).resolves.toEqual([]);
    peer.client.close();
});

test('concurrent task-label creation converges on one Server label', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Task Label Race',
        slug: 'task-label-race',
    });

    const labels = await Promise.all([
        owner.trpc.taskLabel.create.mutate({ name: 'Backend', serverId: server.id }),
        owner.trpc.taskLabel.create.mutate({ name: 'backend', serverId: server.id }),
    ]);

    expect(labels[0]?.label?.id).toBe(labels[1]?.label?.id);
    await expect(owner.trpc.taskLabel.list.query({ serverId: server.id })).resolves.toHaveLength(1);
});

test('maps a case-insensitive task-label rename collision to a conflict', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Task Label Rename',
        slug: 'task-label-rename',
    });
    const backend = await owner.trpc.taskLabel.create.mutate({
        name: 'Backend',
        serverId: server.id,
    });
    await owner.trpc.taskLabel.create.mutate({ name: 'Bug', serverId: server.id });

    await expect(
        owner.trpc.taskLabel.update.mutate({
            labelId: backend.label?.id as string,
            name: 'bug',
            serverId: server.id,
        })
    ).rejects.toThrow(/already exists/i);
});

test('denies task reads and writes after Server membership is revoked', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Task Revocation',
        slug: 'task-revocation',
    });
    const peer = await addTaskPeer(server.id, server.channels[0].id);
    const created = await owner.trpc.task.create.mutate({
        chatId: server.channels[0].id,
        content: 'Remain private after revocation',
        nonce: 'task-revoked-member',
        serverId: server.id,
    });

    await harness.sql`
        update server_memberships set revoked_at = now()
        where server_id = ${server.id} and user_id = ${peer.userId}
    `;

    await expect(peer.client.trpc.task.list.query({ serverId: server.id })).rejects.toThrow(
        /not a member/i
    );
    await expect(
        peer.client.trpc.task.update.mutate({
            expectedVersion: created.task.version,
            messageId: created.task.messageId,
            patch: { priority: 'high' },
            serverId: server.id,
        })
    ).rejects.toThrow(/not a member/i);
    peer.client.close();
});

test('does not resolve a task message through a different Server tenant', async () => {
    const firstServer = await owner.trpc.server.create.mutate({
        displayName: 'Task Tenant One',
        slug: 'task-tenant-one',
    });
    const secondServer = await owner.trpc.server.create.mutate({
        displayName: 'Task Tenant Two',
        slug: 'task-tenant-two',
    });
    const created = await owner.trpc.task.create.mutate({
        chatId: firstServer.channels[0].id,
        content: 'Stay in the first Server',
        nonce: 'task-cross-server',
        serverId: firstServer.id,
    });

    await expect(
        owner.trpc.task.promote.mutate({
            messageId: created.task.messageId,
            serverId: secondServer.id,
        })
    ).rejects.toThrow(/no taskable message/i);
    await expect(
        owner.trpc.task.update.mutate({
            expectedVersion: created.task.version,
            messageId: created.task.messageId,
            patch: { priority: 'high' },
            serverId: secondServer.id,
        })
    ).rejects.toThrow(/no task exists/i);
    const crossServer = await owner.trpc.task.list.query({ serverId: secondServer.id });
    expect(crossServer).toEqual({ backgroundCount: 0, tasks: [] });
});

test('requires every task event to identify its authorized parent Chat', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Task Event Shape',
        slug: 'task-event-shape',
    });
    const created = await owner.trpc.task.create.mutate({
        chatId: server.channels[0].id,
        content: 'Keep event authorization concrete',
        nonce: 'task-event-shape',
        serverId: server.id,
    });
    const insertInvalidEvent = async () => {
        await harness.sql`
            insert into chat_events (cursor, id, server_id, chat_id, event_type, message_id, sequence)
            values (999999, ${`evt_${crypto.randomUUID()}`}, ${server.id}, null, 'task.updated',
                ${created.task.messageId}, 1)
        `;
    };

    await expect(insertInvalidEvent()).rejects.toThrow(/chat_events_shape/i);
});

test('recovers task state and exact invalidation events after a Server restart', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Task Recovery',
        slug: 'task-recovery',
    });
    const created = await owner.trpc.task.create.mutate({
        chatId: server.channels[0].id,
        content: 'Survive the Server restart',
        nonce: 'task-recovery',
        serverId: server.id,
    });
    const beforeClaim = await owner.trpc.chat.events.query({
        afterCursor: '0',
        serverId: server.id,
    });
    const claimed = await owner.trpc.task.update.mutate({
        expectedVersion: created.task.version,
        messageId: created.task.messageId,
        patch: { priority: 'high' },
        serverId: server.id,
    });

    owner.close();
    await harness.restart();
    owner = createHausClient(harness, await harness.clerk.mintSessionToken('user_task_owner'));

    const recovered = await owner.trpc.task.list.query({ serverId: server.id });
    expect(recovered.tasks).toMatchObject([
        {
            task: {
                messageId: created.task.messageId,
                priority: 'high',
                version: claimed.task.version,
            },
        },
    ]);
    await expect(
        owner.trpc.chat.events.query({
            afterCursor: beforeClaim.at(-1)?.cursor as string,
            serverId: server.id,
        })
    ).resolves.toMatchObject([
        {
            chatId: server.channels[0].id,
            messageId: created.task.messageId,
            type: 'task.updated',
        },
    ]);
});

async function addTaskPeer(serverId: string, chatId: string) {
    const clerkUserId = `user_task_peer_${crypto.randomUUID()}`;
    const client = createHausClient(harness, await harness.clerk.mintSessionToken(clerkUserId));
    await client.trpc.server.create.mutate({
        displayName: 'Task Peer Root',
        slug: `task-peer-${crypto.randomUUID().slice(0, 8)}`,
    });
    const [{ id: userId }] = (await harness.sql`
        select id from users where clerk_user_id = ${clerkUserId}
    `) as { id: string }[];
    await harness.sql`
        insert into server_memberships (id, server_id, user_id, role)
        values (${`mem_${crypto.randomUUID()}`}, ${serverId}, ${userId}, 'member')
    `;
    await harness.sql`
        insert into channel_participants (server_id, chat_id, user_id)
        values (${serverId}, ${chatId}, ${userId})
    `;

    return { client, userId };
}

test('assigns a task to an Agent, wakes it with typed work, and writes no message', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Task Agent Assignment',
        slug: 'task-agent-assignment',
    });
    const chatId = server.channels[0].id;
    await harness.sql`
        update server_memberships set handle = 'task-owner' where server_id = ${server.id}
    `;
    const agent = await addTaskAgent(server.id, chatId);
    const created = await owner.trpc.task.create.mutate({
        chatId,
        content: 'Hand this to an Agent',
        nonce: 'task-agent-assignment-message',
        serverId: server.id,
    });

    const assigned = await owner.trpc.task.assign.mutate({
        assignee: { agentId: agent.agentId },
        expectedVersion: created.task.version,
        messageId: created.task.messageId,
        serverId: server.id,
    });
    // Assignment reserves: it never carries a claim and never moves status.
    expect(assigned.task).toMatchObject({
        assigneeAgentId: agent.agentId,
        claimedAt: null,
        status: 'todo',
    });

    // The Agent is subscribed to the task thread, or it would wake, claim, and
    // then silently miss every reply. Reservation has no Thread to point at
    // yet; the first reply materializes it and attaches the follow.
    const readFollows = async () =>
        (await harness.sql`
            select followed from agent_thread_follows
            where server_id = ${server.id} and agent_id = ${agent.agentId}
        `) as { followed: boolean }[];
    expect([...(await readFollows())]).toEqual([]);
    await owner.trpc.chat.send.mutate({
        chatId,
        content: 'First reply',
        nonce: 'task-agent-assignment-reply',
        serverId: server.id,
        thread: { anchorMessageId: created.task.messageId },
    });
    expect([...(await readFollows())].map((row) => row.followed)).toEqual([true]);

    // The handoff is typed pending work keyed by the assignment identity, not a
    // hidden Chat message. It wakes the assignee alongside the canonical task
    // message the Agent already received as a Channel participant.
    const deliveries = (await harness.sql`
        select content, dedupe_key, mentioned, source from agent_inbox
        where server_id = ${server.id} and agent_id = ${agent.agentId}
    `) as { content: string; dedupe_key: string; mentioned: boolean; source: string }[];
    expect([...deliveries].filter((row) => row.source === 'task_assignment')).toEqual([
        {
            content: `[Haus task assignment task=#${assigned.task.number} target=#all assignedBy=@task-owner] Hand this to an Agent`,
            dedupe_key: `task-assign:${created.task.messageId}:${assigned.task.version}`,
            mentioned: true,
            source: 'task_assignment',
        },
    ]);

    // Nothing reached the transcript: every Chat row has a readable author.
    const authorless = (await harness.sql`
        select id from chat_messages
        where server_id = ${server.id}
          and author_user_id is null and author_agent_id is null
    `) as { id: string }[];
    expect(authorless).toEqual([]);
    const history = await owner.trpc.chat.messages.query({ chatId, serverId: server.id });
    expect(history.messages.map((message) => message.content)).toEqual(['Hand this to an Agent']);
});

test('rejects assigning an Agent that does not belong to the parent Chat', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Task Agent Outsider',
        slug: 'task-agent-outsider',
    });
    const chatId = server.channels[0].id;
    const outsider = await addTaskAgent(server.id, null);
    const created = await owner.trpc.task.create.mutate({
        chatId,
        content: 'Outsiders cannot own this',
        nonce: 'task-agent-outsider-message',
        serverId: server.id,
    });

    await expect(
        owner.trpc.task.assign.mutate({
            assignee: { agentId: outsider.agentId },
            expectedVersion: created.task.version,
            messageId: created.task.messageId,
            serverId: server.id,
        })
    ).rejects.toThrow(/parent Chat/iu);
});

test('rejects assigning a retired Agent', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Task Agent Retired',
        slug: 'task-agent-retired',
    });
    const chatId = server.channels[0].id;
    const agent = await addTaskAgent(server.id, chatId);
    await harness.sql`
        update agents set retired_at = now()
        where server_id = ${server.id} and id = ${agent.agentId}
    `;
    const created = await owner.trpc.task.create.mutate({
        chatId,
        content: 'A retired Agent will never wake',
        nonce: 'task-agent-retired-message',
        serverId: server.id,
    });

    await expect(
        owner.trpc.task.assign.mutate({
            assignee: { agentId: agent.agentId },
            expectedVersion: created.task.version,
            messageId: created.task.messageId,
            serverId: server.id,
        })
    ).rejects.toThrow(/active Agent/iu);
});

async function addTaskAgent(serverId: string, chatId: null | string) {
    const computerId = `cmp_${randomBytes(12).toString('base64url')}`;
    const agentId = `agt_${randomBytes(12).toString('base64url')}`;
    const handle = `ada-${crypto.randomUUID().slice(0, 8)}`;
    const [{ id: attachedByUserId }] = (await harness.sql`
        select user_id as id from server_memberships
        where server_id = ${serverId} and role = 'owner' limit 1
    `) as { id: string }[];
    await harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash)
        values (${computerId}, ${serverId}, ${attachedByUserId}, ${randomBytes(32).toString('hex')})
    `;
    await harness.sql`
        insert into agents (id, server_id, computer_id, handle, display_name,
            desired_model_id, desired_runtime_id, home_timezone)
        values (${agentId}, ${serverId}, ${computerId}, ${handle}, 'Ada',
            'fake-model', 'fake', 'UTC')
    `;
    if (chatId) {
        await harness.sql`
            insert into channel_agent_participants (server_id, chat_id, agent_id)
            values (${serverId}, ${chatId}, ${agentId})
        `;
    }
    return { agentId, handle };
}
