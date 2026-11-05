import { afterAll, beforeAll, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { captureAllTopics, publishedKinds } from './realtime-capture.ts';

let harness: HausServerHarness;
let owner: HausClient;

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = createHausClient(harness, await harness.humans.mintSessionToken('user_claim_owner'));
});

afterAll(async () => {
    owner.close();
    await harness.close();
});

test('promotes one canonical Server message into its deterministic Thread work surface', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Claim Server',
        slug: 'claim-server',
    });
    const chatId = server.channels[0].id;
    const sent = await owner.trpc.chat.send.mutate({
        chatId,
        content: 'Audit the Server export',
        nonce: 'claim-promote-message',
        serverId: server.id,
    });

    const realtime = captureAllTopics();
    const promoted = await owner.trpc.claim.promote.mutate({
        messageId: sent.message.id,
        serverId: server.id,
    });
    const replayed = await owner.trpc.claim.promote.mutate({
        messageId: sent.message.id,
        serverId: server.id,
    });

    expect(promoted).toMatchObject({
        idempotent: false,
        claim: {
            chatId,
            messageId: sent.message.id,
            number: 1,
            status: 'todo',
            threadChatId: `cht_thr_${sent.message.id.slice('msg_'.length)}`,
            version: 1,
        },
    });
    expect(replayed).toEqual({ ...promoted, idempotent: true });
    // The replay announces nothing.
    expect(await publishedKinds(realtime, sent.message.id)).toEqual(['claim.created']);
    realtime.stop();
    const { claims } = await owner.trpc.claim.list.query({ serverId: server.id });
    expect(claims).toMatchObject([
        {
            message: { content: 'Audit the Server export', id: sent.message.id },
            claim: { messageId: sent.message.id, number: 1 },
        },
    ]);
    // Promotion only derives the Thread id: the first reply creates the Thread.
    const promotedThread = (await harness.sql`
        select id from chats where server_id = ${server.id} and id = ${promoted.claim.threadChatId}
    `) as { id: string }[];
    expect(promotedThread).toEqual([]);
    const promotionMessages = await owner.trpc.chat.messages.query({ chatId, serverId: server.id });
    expect(promotionMessages.messages).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                id: sent.message.id,
                claim: expect.objectContaining({
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
        displayName: 'Unclaimable Thread Reply',
        slug: 'unclaimable-thread-reply',
    });
    const chatId = server.channels[0].id;
    const anchor = await owner.trpc.chat.send.mutate({
        chatId,
        content: 'Anchor for the reply',
        nonce: 'unclaimable-thread-anchor',
        serverId: server.id,
    });
    const reply = await owner.trpc.chat.send.mutate({
        chatId,
        content: 'A reply is not a claim',
        nonce: 'unclaimable-thread-reply',
        serverId: server.id,
        thread: { anchorMessageId: anchor.message.id },
    });

    await expect(
        owner.trpc.claim.promote.mutate({
            messageId: reply.message.id,
            serverId: server.id,
        })
    ).rejects.toThrow(/human or Agent messages.*top-level Channel or DM/i);
});

test('creates a claim-message atomically and replays the same nonce idempotently', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Claim Create',
        slug: 'claim-create',
    });
    const chatId = server.channels[0].id;
    const input = {
        chatId,
        content: 'Ship the claim lane',
        nonce: 'claim-create-once',
        serverId: server.id,
    };

    const realtime = captureAllTopics();
    const created = await owner.trpc.claim.create.mutate(input);
    const replayed = await owner.trpc.claim.create.mutate(input);

    expect(created).toMatchObject({
        idempotent: false,
        claim: { messageId: created.claim.messageId, number: 1, origin: 'composed' },
    });
    expect(replayed).toEqual({ ...created, idempotent: true });
    const createdList = await owner.trpc.claim.list.query({ serverId: server.id });
    expect(createdList.claims).toHaveLength(1);
    expect(await publishedKinds(realtime, created.claim.messageId)).toEqual([
        'claim.created',
        'message.created',
    ]);
    realtime.stop();
    const creationMessages = await owner.trpc.chat.messages.query({ chatId, serverId: server.id });
    expect(creationMessages.messages).toHaveLength(1);
    expect(creationMessages.messages[0]?.id).toBe(created.claim.messageId);
});

test('lists the claim Thread summary and DM peer identity', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Claim Thread Summary',
        slug: 'claim-thread-summary',
    });
    const peer = await addClaimPeer(server.id, server.channels[0].id);
    const dm = await owner.trpc.chat.ensureDm.mutate({
        peerUserId: peer.userId,
        serverId: server.id,
    });
    const created = await owner.trpc.claim.create.mutate({
        chatId: dm.id,
        content: 'Discuss this privately',
        nonce: 'claim-thread-summary-create',
        serverId: server.id,
    });
    await owner.trpc.chat.send.mutate({
        chatId: dm.id,
        content: 'First claim reply',
        nonce: 'claim-thread-summary-reply',
        serverId: server.id,
        thread: { anchorMessageId: created.claim.messageId },
    });
    await owner.trpc.thread.setFollow.mutate({
        follow: false,
        serverId: server.id,
        threadChatId: created.claim.threadChatId,
    });

    const listed = await owner.trpc.claim.list.query({ serverId: server.id });
    expect(listed.claims).toMatchObject([
        {
            chatKind: 'dm',
            chatName: null,
            chatPeerUserId: peer.userId,
            threadSummary: {
                anchorMessageId: created.claim.messageId,
                followed: false,
                replyCount: 1,
                threadChatId: created.claim.threadChatId,
            },
        },
    ]);
    peer.client.close();
});

test('rejects claim creation in a Thread as a bad request', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Claim Thread Create',
        slug: 'claim-thread-create',
    });
    const chatId = server.channels[0].id;
    const created = await owner.trpc.claim.create.mutate({
        chatId,
        content: 'Parent claim',
        nonce: 'claim-thread-parent',
        serverId: server.id,
    });
    // The Thread has to exist before it can be refused as a claim's parent Chat.
    await owner.trpc.chat.send.mutate({
        chatId,
        content: 'First reply',
        nonce: 'claim-thread-first-reply',
        serverId: server.id,
        thread: { anchorMessageId: created.claim.messageId },
    });

    await expect(
        owner.trpc.claim.create.mutate({
            chatId: created.claim.threadChatId,
            content: 'Nested claim',
            nonce: 'claim-thread-nested',
            serverId: server.id,
        })
    ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });
});

test('blocks a nonmember from creating a claim', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Claim Unknown User',
        slug: 'claim-unknown-user',
    });
    const stranger = createHausClient(
        harness,
        await harness.humans.mintSessionToken('user_claim_stranger')
    );

    await expect(
        stranger.trpc.claim.create.mutate({
            chatId: server.channels[0].id,
            content: 'Invisible claim',
            nonce: 'claim-unknown-user-create',
            serverId: server.id,
        })
    ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
    stranger.close();
});

test('a human is never a claim assignee', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Claim Human Assignee',
        slug: 'claim-human-assignee',
    });
    const chatId = server.channels[0].id;
    const peer = await addClaimPeer(server.id, chatId);
    const agent = await addClaimAgent(server.id, chatId);
    const created = await owner.trpc.claim.create.mutate({
        chatId,
        content: 'Only Agents hold claims',
        nonce: 'claim-human-assignee',
        serverId: server.id,
    });

    // Claims are Agent work (ADR 0037): the wire has no human assignee shape.
    await expect(
        owner.trpc.claim.create.mutate({
            assigneeUserId: peer.userId,
            chatId,
            content: 'Reserve this for a human',
            nonce: 'claim-human-assignee-create',
            serverId: server.id,
        } as never)
    ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });
    await expect(
        owner.trpc.claim.assign.mutate({
            assignee: { kind: 'human', userId: peer.userId },
            expectedVersion: created.claim.version,
            messageId: created.claim.messageId,
            serverId: server.id,
        } as never)
    ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });
    // A human id where an Agent id belongs is not an active Agent.
    await expect(
        owner.trpc.claim.assign.mutate({
            assignee: { agentId: peer.userId },
            expectedVersion: created.claim.version,
            messageId: created.claim.messageId,
            serverId: server.id,
        })
    ).rejects.toThrow(/active Agent/iu);

    // The picker offers the Chat's Agents and no humans.
    await expect(
        peer.client.trpc.claim.assignees.query({
            messageId: created.claim.messageId,
            serverId: server.id,
        })
    ).resolves.toEqual([
        { agentId: agent.agentId, avatarUrl: null, displayName: 'Ada', handle: agent.handle },
    ]);
    peer.client.close();
});

test('any Chat member assigns an Agent, and an owner unassigns without moving status', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Claim Assignment',
        slug: 'claim-assignment',
    });
    const chatId = server.channels[0].id;
    const peer = await addClaimPeer(server.id, chatId);
    const agent = await addClaimAgent(server.id, chatId);
    const created = await owner.trpc.claim.create.mutate({
        chatId,
        content: 'Reserve this claim',
        nonce: 'claim-assignment-message',
        serverId: server.id,
    });
    const started = await owner.trpc.claim.update.mutate({
        expectedVersion: created.claim.version,
        messageId: created.claim.messageId,
        patch: { status: 'in_review' },
        serverId: server.id,
    });

    // Assigning is member-level, not an admin power.
    const assigned = await peer.client.trpc.claim.assign.mutate({
        assignee: { agentId: agent.agentId },
        expectedVersion: started.claim.version,
        messageId: created.claim.messageId,
        serverId: server.id,
    });
    expect(assigned.claim).toMatchObject({
        assigneeAgentId: agent.agentId,
        claimedAt: null,
        status: 'in_review',
        version: 3,
    });

    const unassigned = await owner.trpc.claim.assign.mutate({
        assignee: null,
        expectedVersion: assigned.claim.version,
        messageId: created.claim.messageId,
        serverId: server.id,
    });
    expect(unassigned.claim).toMatchObject({
        assigneeAgentId: null,
        claimedAt: null,
        status: 'in_review',
        version: 4,
    });
    peer.client.close();
});

test('serializes competing Agent assignments at one expected claim version', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Claim Reservation Race',
        slug: 'claim-reservation-race',
    });
    const chatId = server.channels[0].id;
    const first = await addClaimAgent(server.id, chatId);
    const second = await addClaimAgent(server.id, chatId);
    const created = await owner.trpc.claim.create.mutate({
        chatId,
        content: 'Reserve for exactly one Agent',
        nonce: 'claim-reservation-race',
        serverId: server.id,
    });

    const reservations = await Promise.allSettled(
        [first, second].map((agent) =>
            owner.trpc.claim.assign.mutate({
                assignee: { agentId: agent.agentId },
                expectedVersion: created.claim.version,
                messageId: created.claim.messageId,
                serverId: server.id,
            })
        )
    );

    expect(reservations.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(reservations.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const [reserved] = (await owner.trpc.claim.list.query({ serverId: server.id })).claims;
    expect([first.agentId, second.agentId]).toContain(reserved.claim.assigneeAgentId);
    expect(reserved.claim.version).toBe(2);
});

test('updates status with expected versions', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Claim Metadata',
        slug: 'claim-metadata',
    });
    const chatId = server.channels[0].id;
    const peer = await addClaimPeer(server.id, chatId);
    const created = await owner.trpc.claim.create.mutate({
        chatId,
        content: 'Review claim metadata',
        nonce: 'claim-metadata-message',
        serverId: server.id,
    });

    const updated = await peer.client.trpc.claim.update.mutate({
        expectedVersion: created.claim.version,
        messageId: created.claim.messageId,
        patch: { status: 'in_review' },
        serverId: server.id,
    });
    expect(updated.claim).toMatchObject({ status: 'in_review', version: 2 });
    await expect(
        owner.trpc.claim.update.mutate({
            expectedVersion: created.claim.version,
            messageId: created.claim.messageId,
            patch: { status: 'done' },
            serverId: server.id,
        })
    ).rejects.toThrow(/changed|refresh/i);
    peer.client.close();
});

test('keeps task-label management Server-scoped and admin-controlled', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Claim Labels',
        slug: 'task-labels',
    });
    const peer = await addClaimPeer(server.id, server.channels[0].id);
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
        displayName: 'Claim Label Race',
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
        displayName: 'Claim Label Rename',
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

test('denies claim reads and writes after Server membership is revoked', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Claim Revocation',
        slug: 'claim-revocation',
    });
    const peer = await addClaimPeer(server.id, server.channels[0].id);
    const created = await owner.trpc.claim.create.mutate({
        chatId: server.channels[0].id,
        content: 'Remain private after revocation',
        nonce: 'claim-revoked-member',
        serverId: server.id,
    });

    await harness.sql`
        update server_memberships set revoked_at = now()
        where server_id = ${server.id} and user_id = ${peer.userId}
    `;

    await expect(peer.client.trpc.claim.list.query({ serverId: server.id })).rejects.toThrow(
        /not a member/i
    );
    await expect(
        peer.client.trpc.claim.update.mutate({
            expectedVersion: created.claim.version,
            messageId: created.claim.messageId,
            patch: { status: 'closed' },
            serverId: server.id,
        })
    ).rejects.toThrow(/not a member/i);
    peer.client.close();
});

test('does not resolve a claim message through a different Server tenant', async () => {
    const firstServer = await owner.trpc.server.create.mutate({
        displayName: 'Claim Tenant One',
        slug: 'claim-tenant-one',
    });
    const secondServer = await owner.trpc.server.create.mutate({
        displayName: 'Claim Tenant Two',
        slug: 'claim-tenant-two',
    });
    const created = await owner.trpc.claim.create.mutate({
        chatId: firstServer.channels[0].id,
        content: 'Stay in the first Server',
        nonce: 'claim-cross-server',
        serverId: firstServer.id,
    });

    await expect(
        owner.trpc.claim.promote.mutate({
            messageId: created.claim.messageId,
            serverId: secondServer.id,
        })
    ).rejects.toThrow(/no claimable message/i);
    await expect(
        owner.trpc.claim.update.mutate({
            expectedVersion: created.claim.version,
            messageId: created.claim.messageId,
            patch: { status: 'closed' },
            serverId: secondServer.id,
        })
    ).rejects.toThrow(/no claim exists/i);
    const crossServer = await owner.trpc.claim.list.query({ serverId: secondServer.id });
    expect(crossServer).toEqual({ backgroundCount: 0, claims: [] });
});

test('recovers claim state after a Server restart', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Claim Recovery',
        slug: 'claim-recovery',
    });
    const created = await owner.trpc.claim.create.mutate({
        chatId: server.channels[0].id,
        content: 'Survive the Server restart',
        nonce: 'claim-recovery',
        serverId: server.id,
    });
    const claimed = await owner.trpc.claim.update.mutate({
        expectedVersion: created.claim.version,
        messageId: created.claim.messageId,
        patch: { status: 'closed' },
        serverId: server.id,
    });

    owner.close();
    await harness.restart();
    owner = createHausClient(harness, await harness.humans.mintSessionToken('user_claim_owner'));

    const recovered = await owner.trpc.claim.list.query({ serverId: server.id });
    expect(recovered.claims).toMatchObject([
        {
            claim: {
                messageId: created.claim.messageId,
                status: 'closed',
                version: claimed.claim.version,
            },
        },
    ]);
});

async function addClaimPeer(serverId: string, chatId: string) {
    const subject = `user_claim_peer_${crypto.randomUUID()}`;
    const client = createHausClient(harness, await harness.humans.mintSessionToken(subject));
    await client.trpc.server.create.mutate({
        displayName: 'Claim Peer Root',
        slug: `claim-peer-${crypto.randomUUID().slice(0, 8)}`,
    });
    const [{ id: userId }] = (await harness.sql`
        select id from users where auth_subject = ${subject}
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

test('assigns a claim to an Agent, wakes it with typed work, and writes no message', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Claim Agent Assignment',
        slug: 'claim-agent-assignment',
    });
    const chatId = server.channels[0].id;
    await harness.sql`
        update server_memberships set handle = 'claim-owner' where server_id = ${server.id}
    `;
    const agent = await addClaimAgent(server.id, chatId);
    const created = await owner.trpc.claim.create.mutate({
        chatId,
        content: 'Hand this to an Agent',
        nonce: 'claim-agent-assignment-message',
        serverId: server.id,
    });

    const assigned = await owner.trpc.claim.assign.mutate({
        assignee: { agentId: agent.agentId },
        expectedVersion: created.claim.version,
        messageId: created.claim.messageId,
        serverId: server.id,
    });
    // Assignment reserves: it never carries a claim and never moves status.
    expect(assigned.claim).toMatchObject({
        assigneeAgentId: agent.agentId,
        claimedAt: null,
        status: 'todo',
    });

    // The Agent is subscribed to the claim thread, or it would wake, claim, and
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
        nonce: 'claim-agent-assignment-reply',
        serverId: server.id,
        thread: { anchorMessageId: created.claim.messageId },
    });
    expect([...(await readFollows())].map((row) => row.followed)).toEqual([true]);

    // The handoff is typed pending work keyed by the assignment identity, not a
    // hidden Chat message. It wakes the assignee alongside the canonical claim
    // message the Agent already received as a Channel participant.
    const deliveries = (await harness.sql`
        select content, dedupe_key, mentioned, source from agent_inbox
        where server_id = ${server.id} and agent_id = ${agent.agentId}
    `) as { content: string; dedupe_key: string; mentioned: boolean; source: string }[];
    expect([...deliveries].filter((row) => row.source === 'claim_assignment')).toEqual([
        {
            content: `[Haus claim assignment claim=#${assigned.claim.number} target=#all assignedBy=@claim-owner] Hand this to an Agent`,
            dedupe_key: `claim-assign:${created.claim.messageId}:${assigned.claim.version}`,
            mentioned: true,
            source: 'claim_assignment',
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
        displayName: 'Claim Agent Outsider',
        slug: 'claim-agent-outsider',
    });
    const chatId = server.channels[0].id;
    const outsider = await addClaimAgent(server.id, null);
    const created = await owner.trpc.claim.create.mutate({
        chatId,
        content: 'Outsiders cannot own this',
        nonce: 'claim-agent-outsider-message',
        serverId: server.id,
    });

    await expect(
        owner.trpc.claim.assign.mutate({
            assignee: { agentId: outsider.agentId },
            expectedVersion: created.claim.version,
            messageId: created.claim.messageId,
            serverId: server.id,
        })
    ).rejects.toThrow(/parent Chat/iu);
});

test('rejects assigning a retired Agent', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Claim Agent Retired',
        slug: 'claim-agent-retired',
    });
    const chatId = server.channels[0].id;
    const agent = await addClaimAgent(server.id, chatId);
    await harness.sql`
        update agents set retired_at = now()
        where server_id = ${server.id} and id = ${agent.agentId}
    `;
    const created = await owner.trpc.claim.create.mutate({
        chatId,
        content: 'A retired Agent will never wake',
        nonce: 'claim-agent-retired-message',
        serverId: server.id,
    });

    await expect(
        owner.trpc.claim.assign.mutate({
            assignee: { agentId: agent.agentId },
            expectedVersion: created.claim.version,
            messageId: created.claim.messageId,
            serverId: server.id,
        })
    ).rejects.toThrow(/active Agent/iu);
});

async function addClaimAgent(serverId: string, chatId: null | string) {
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
