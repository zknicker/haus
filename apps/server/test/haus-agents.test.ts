import { afterAll, beforeAll, expect, test } from 'bun:test';
import { hausAgentVersion } from '@haus/api';
import { createHomedAgent } from './agent-home.fixture.ts';
import { openCaptainChat } from './captain-chat.fixture.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { reportRunnerModels } from './runner.fixture.ts';

let harness: HausServerHarness;
let owner: HausClient;
let member: HausClient;
let serverId: string;
let ownerUserId: string;

const credentialHash = 'a'.repeat(64);
const otherCredentialHash = 'b'.repeat(64);
const foreignCredentialHash = 'c'.repeat(64);
const computerA = 'cmp_aaaaaaaaaaaaaaaa';
const computerB = 'cmp_bbbbbbbbbbbbbbbb';
const foreignComputer = 'cmp_cccccccccccccccc';

const codexRuntime = {
    id: 'codex',
    label: 'Codex',
    models: [
        { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' },
        { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra' },
    ],
};

beforeAll(async () => {
    harness = await startHausServerHarness();
    await reportRunnerModels(harness, { runtimes: [codexRuntime] });
    owner = await signIn('user_agent_owner');
    member = await signIn('user_agent_member');

    const server = await owner.trpc.server.create.mutate({
        displayName: 'Agent HQ',
        slug: 'agent-hq',
    });
    serverId = server.id;
    ownerUserId = await readUserId('user_agent_owner');
    await member.trpc.server.create.mutate({ displayName: 'Member Root', slug: 'member-root' });
    const memberUserId = await readUserId('user_agent_member');

    await harness.sql`
        insert into server_memberships (id, server_id, user_id, role)
        values ('mem_agent_member', ${serverId}, ${memberUserId}, 'member')
    `;

    const foreign = await owner.trpc.server.create.mutate({
        displayName: 'Other',
        slug: 'other-hq',
    });

    await insertComputer(serverId, computerA, credentialHash, { runtimes: [codexRuntime] });
    await insertComputer(serverId, computerB, otherCredentialHash, { runtimes: [codexRuntime] });
    await insertComputer(foreign.id, foreignComputer, foreignCredentialHash, {
        runtimes: [codexRuntime],
    });
});

afterAll(async () => {
    owner.close();
    member.close();
    await harness.close();
});

test('provisions an ordinary Agent without pre-creating an Owner DM', async () => {
    const created = await createHomedAgent(owner, {
        computerId: computerA,
        description: 'Reviews launch copy and records concrete risks.',
        displayName: 'Scout',
        handle: 'scout',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId,
    });

    expect(created.agent).toMatchObject({
        avatarUrl: null,
        computerId: computerA,
        description: 'Reviews launch copy and records concrete risks.',
        desiredModelId: 'gpt-5.6-sol',
        desiredRuntimeId: 'codex',
        displayName: 'Scout',
        hausAgent: {
            appliedAt: null,
            appliedVersion: null,
            currentVersion: hausAgentVersion,
            status: 'pending',
        },
        handle: 'scout',
        status: 'pending',
    });
    expect(created.agent).not.toHaveProperty('archetype');
    expect(created.agent).not.toHaveProperty('factoryKind');
    const chats = await owner.trpc.chat.list.query({ serverId });
    const captainChat = chats.find((chat) => chat.peerAgentId === created.agent.id);
    expect(captainChat?.captainChat).toEqual({ member: true, subscribed: true });
    expect(created.agent).toMatchObject({ captainChatId: captainChat?.id, ownerUserId });

    const agents = await owner.trpc.agent.list.query({ serverId });
    expect(agents.map((agent) => agent.handle)).toEqual(['scout']);
    expect(agents[0]).toMatchObject({ avatarUrl: null, handle: 'scout' });
    expect(agents[0]).not.toHaveProperty('archetype');
    expect(agents[0]?.captainChatId).toBe(captainChat?.id ?? '');
    expect(await owner.trpc.agent.get.query({ agentId: created.agent.id, serverId })).toEqual(
        agents[0]
    );
});

test('every Captain has exactly one Captain chat', async () => {
    const [agent] = await owner.trpc.agent.list.query({ serverId });
    if (!agent) {
        throw new Error('Expected the provisioned Agent.');
    }

    const [first, retry] = await Promise.all([
        openCaptainChat(owner, { agentId: agent.id, serverId }),
        openCaptainChat(owner, { agentId: agent.id, serverId }),
    ]);

    expect(retry.id).toBe(first.id);
    expect(
        (await owner.trpc.chat.list.query({ serverId })).filter(
            (chat) => chat.peerAgentId === agent.id
        )
    ).toHaveLength(1);
});

test('people share one Captain chat, and a send is idempotent by nonce', async () => {
    const created = await createHomedAgent(owner, {
        computerId: computerB,
        displayName: 'Relay',
        handle: 'relay',
        modelId: 'gpt-5.6-terra',
        runtimeId: 'codex',
        serverId,
    });
    const input = {
        agentId: created.agent.id,
        content: 'Send once.',
        nonce: 'captain-chat-retry',
        serverId,
        targetKind: 'captain' as const,
    };
    const [first, retry] = await Promise.all([
        owner.trpc.chat.send.mutate(input),
        owner.trpc.chat.send.mutate(input),
    ]);

    expect(retry.message.id).toBe(first.message.id);
    expect([first.idempotent, retry.idempotent].sort()).toEqual([false, true]);
    const memberSend = await member.trpc.chat.send.mutate({
        agentId: created.agent.id,
        content: 'The same chat, from someone else.',
        nonce: 'captain-chat-member',
        serverId,
        targetKind: 'captain',
    });
    expect(memberSend.message.chatId).toBe(first.message.chatId);
    expect(
        (await member.trpc.chat.list.query({ serverId })).find(
            (chat) => chat.id === first.message.chatId
        )?.captainChat
    ).toEqual({ member: true, subscribed: true });
    expect(
        (
            await harness.sql`
            select count(*)::int as count from chats
            where server_id = ${serverId} and captain_agent_id = ${created.agent.id}
        `
        )[0]?.count
    ).toBe(1);
    await owner.trpc.agent.delete.mutate({
        agentId: created.agent.id,
        confirmation: created.agent.displayName,
        serverId,
    });
});

test('restricts one-run execution detail to Server Owners and Admins', async () => {
    const [agent] = await owner.trpc.agent.list.query({ serverId });
    if (!agent) {
        throw new Error('Expected the provisioned Agent.');
    }

    const input = { agentId: agent.id, runId: 'run_detail', serverId };
    const outlines = { agentId: agent.id, runIds: ['run_detail'], serverId };
    await expect(member.trpc.agent.executionJournal.query(input)).rejects.toThrow(
        /Owner or Admin/i
    );
    await expect(member.trpc.agent.executionOutlines.query(outlines)).rejects.toThrow(
        /Owner or Admin/i
    );
    await expect(owner.trpc.agent.executionJournal.query(input)).resolves.toMatchObject({
        status: 'missing',
    });
    await expect(owner.trpc.agent.executionOutlines.query(outlines)).resolves.toEqual({
        outlines: [{ runId: 'run_detail', status: 'missing' }],
    });
});

test('fails closed on a runtime or model the runner never offered', async () => {
    await expect(
        createHomedAgent(owner, {
            computerId: computerA,
            displayName: 'Ghost',
            handle: 'ghost',
            modelId: 'gpt-9-imaginary',
            runtimeId: 'codex',
            serverId,
        })
    ).rejects.toThrow(/does not offer the model/i);

    await expect(
        createHomedAgent(owner, {
            computerId: computerA,
            displayName: 'Ghost',
            handle: 'ghost',
            modelId: 'grok-4.6',
            runtimeId: 'grok-build',
            serverId,
        })
    ).rejects.toThrow(/does not offer the model/i);
});

test('fails closed when configuration references another Server’s Computer', async () => {
    await expect(
        createHomedAgent(owner, {
            computerId: foreignComputer,
            displayName: 'Ghost',
            handle: 'ghost',
            modelId: 'gpt-5.6-sol',
            runtimeId: 'codex',
            serverId,
        })
    ).rejects.toThrow(/not attached to this Server/i);
});

test('only an Owner or Admin can create an Agent', async () => {
    await expect(
        createHomedAgent(member, {
            computerId: computerA,
            displayName: 'Nope',
            handle: 'nope',
            modelId: 'gpt-5.6-sol',
            runtimeId: 'codex',
            serverId,
        })
    ).rejects.toThrow(/Owner or Admin/i);
});

test('saves desired config from the runner catalog while the Computer is offline, immutably assigned', async () => {
    await harness.sql`update computers set health = 'offline' where id = ${computerA}`;

    const [agent] = await owner.trpc.agent.list.query({ serverId });
    const reconfigured = await owner.trpc.agent.configure.mutate({
        agentId: agent.id,
        modelId: 'gpt-5.6-terra',
        runtimeId: 'codex',
        serverId,
    });

    expect(reconfigured).toMatchObject({
        computerId: computerA,
        desiredModelId: 'gpt-5.6-terra',
        status: 'pending',
    });
    const [rotated] = await harness.sql`
        select session_generation, session_reset_kind
        from agents
        where id = ${agent.id}
    `;
    expect(rotated).toMatchObject({
        session_generation: 2,
        session_reset_kind: 'session',
    });
    // The rotation is a durable Agent fact, not a Chat message.
    const rotations = await harness.sql`
        select generation, reason from agent_session_rotations where agent_id = ${agent.id}
    `;
    expect(rotations).toEqual([{ generation: 2, reason: 'configuration' }]);
    const dmMessages = await harness.sql`
        select id from chat_messages where chat_id = ${agent.captainChatId}
    `;
    expect(dmMessages).toEqual([]);

    // The rotation record reads that fact back.
    await expect(
        owner.trpc.agent.sessionRotation.query({ agentId: agent.id, generation: 2, serverId })
    ).resolves.toMatchObject({
        generation: 2,
        previousDurationMs: expect.any(Number),
        reason: 'configuration',
        rotatedAt: expect.any(String),
    });
    // The Agent's first session never rotated into being.
    await expect(
        owner.trpc.agent.sessionRotation.query({ agentId: agent.id, generation: 1, serverId })
    ).rejects.toThrow(/no session rotation/i);
    // Any Server member reads it; the card is part of the transcript.
    await expect(
        member.trpc.agent.sessionRotation.query({ agentId: agent.id, generation: 2, serverId })
    ).resolves.toMatchObject({ generation: 2, reason: 'configuration' });

    await owner.trpc.agent.configure.mutate({
        agentId: agent.id,
        modelId: 'gpt-5.6-terra',
        runtimeId: 'codex',
        serverId,
    });
    const [unchanged] = await harness.sql`
        select session_generation
        from agents
        where id = ${agent.id}
    `;
    expect(unchanged?.session_generation).toBe(2);
    const [rotationCount] = await harness.sql`
        select count(*)::int as count
        from agent_session_rotations where agent_id = ${agent.id}
    `;
    expect(rotationCount?.count).toBe(1);

    await expect(
        owner.trpc.agent.configure.mutate({
            agentId: agent.id,
            modelId: 'gpt-5.6-unreleased',
            runtimeId: 'codex',
            serverId,
        })
    ).rejects.toThrow(/does not offer the model/i);
});

test('shows pending, then applied, then degraded as effective state is reported', async () => {
    const [agent] = await owner.trpc.agent.list.query({ serverId });

    await harness.sql`
        update agents
        set effective_runtime_id = desired_runtime_id,
            effective_model_id = desired_model_id,
            effective_reasoning_effort = desired_reasoning_effort,
            effective_missing = null,
            effective_reported_at = now()
        where id = ${agent.id}
    `;
    let refreshed = await owner.trpc.agent.list.query({ serverId });
    expect(refreshed[0]?.status).toBe('applied');
    expect(refreshed[0]?.hausAgent.status).toBe('pending');

    await harness.sql`
        update agents
        set effective_haus_agent_applied_at = now(),
            effective_haus_agent_status = 'current',
            effective_haus_agent_version = ${hausAgentVersion}
        where id = ${agent.id}
    `;
    refreshed = await owner.trpc.agent.list.query({ serverId });
    expect(refreshed[0]?.hausAgent).toMatchObject({
        appliedVersion: hausAgentVersion,
        currentVersion: hausAgentVersion,
        status: 'current',
    });

    await harness.sql`
        update agents
        set effective_haus_agent_status = 'failed',
            effective_haus_agent_version = '0.9.0'
        where id = ${agent.id}
    `;
    refreshed = await owner.trpc.agent.list.query({ serverId });
    expect(refreshed[0]?.hausAgent).toMatchObject({
        appliedVersion: '0.9.0',
        currentVersion: hausAgentVersion,
        status: 'failed',
    });

    await harness.sql`
        update agents set effective_missing = ${['model:gpt-5.6-terra']}::jsonb
        where id = ${agent.id}
    `;
    refreshed = await owner.trpc.agent.list.query({ serverId });
    expect(refreshed[0]?.status).toBe('degraded');
    expect(refreshed[0]?.missingResources).toEqual(['model:gpt-5.6-terra']);

    await harness.sql`
        update agents
        set effective_missing = null, effective_model_id = 'gpt-5.6-sol'
        where id = ${agent.id}
    `;
    refreshed = await owner.trpc.agent.list.query({ serverId });
    expect(refreshed[0]?.status).toBe('pending');
});

test('retires an Agent immediately, preserves authored history, and then permits Computer removal', async () => {
    const [agent] = await owner.trpc.agent.list.query({ serverId });
    const chat = (await owner.trpc.chat.list.query({ serverId })).find(
        (entry) => entry.peerAgentId === agent.id
    );
    if (!chat) {
        throw new Error('Expected Agent DM.');
    }

    await harness.sql`
        insert into chat_messages (id, server_id, chat_id, author_agent_id, content, nonce, sequence)
        values ('msg_agent_tombstone', ${serverId}, ${chat.id}, ${agent.id}, 'Keep this history.', 'tombstone', 1000)
    `;
    await harness.sql`
        insert into message_claims (
            server_id, message_id, chat_id, number, status, origin,
            created_by_agent_id, assignee_agent_id, claimed_at
        )
        values (
            ${serverId}, 'msg_agent_tombstone', ${chat.id}, 1, 'in_progress', 'composed',
            ${agent.id}, ${agent.id}, now()
        )
    `;

    await expect(
        owner.trpc.computer.remove.mutate({
            computerId: computerA,
            confirmation: 'REMOVE',
            serverId,
        })
    ).rejects.toThrow(/Choose a new Machine for/i);
    await expect(
        owner.trpc.agent.delete.mutate({
            agentId: agent.id,
            confirmation: 'wrong name',
            serverId,
        })
    ).rejects.toThrow(/Type the Agent name exactly/i);

    await owner.trpc.agent.delete.mutate({
        agentId: agent.id,
        confirmation: agent.displayName,
        serverId,
    });

    expect(await owner.trpc.agent.list.query({ serverId })).toEqual([]);
    const retired = (await harness.sql`
        select computer_id, retired_at from agents where id = ${agent.id}
    `) as { computer_id: string | null; retired_at: Date | null }[];
    expect(retired[0]).toMatchObject({ computer_id: computerA });
    expect(retired[0]?.retired_at).toBeTruthy();
    const history = (await harness.sql`
        select author_agent_id, content from chat_messages where id = 'msg_agent_tombstone'
    `) as { author_agent_id: string; content: string }[];
    expect(history).toEqual([{ author_agent_id: agent.id, content: 'Keep this history.' }]);
    const transcript = await owner.trpc.chat.messages.query({
        chatId: chat.id,
        limit: 50,
        serverId,
    });
    expect(
        transcript.messages.find((message) => message.id === 'msg_agent_tombstone')
    ).toMatchObject({
        author: {
            agentId: agent.id,
            kind: 'agent',
            profile: {
                avatarUrl: agent.avatarUrl,
                deleted: true,
                description: agent.description,
                displayName: agent.displayName,
            },
        },
    });
    const released = (await harness.sql`
        select assignee_agent_id, claimed_at, version
        from message_claims
        where server_id = ${serverId} and message_id = 'msg_agent_tombstone'
    `) as Array<{
        assignee_agent_id: string | null;
        claimed_at: Date | null;
        version: number;
    }>;
    expect(released).toEqual([{ assignee_agent_id: null, claimed_at: null, version: 2 }]);

    await owner.trpc.computer.remove.mutate({
        computerId: computerA,
        confirmation: 'REMOVE',
        serverId,
    });
    const gone = (await harness.sql`select id from computers where id = ${computerA}`) as {
        id: string;
    }[];
    expect(gone).toEqual([]);
    const detachedTombstone = (await harness.sql`
        select computer_id from agents where id = ${agent.id}
    `) as { computer_id: string | null }[];
    expect(detachedTombstone).toEqual([{ computer_id: null }]);
});

test('hides a retired Agent DM, preserves its transcript, and rejects new sends', async () => {
    const created = await createHomedAgent(owner, {
        computerId: computerB,
        displayName: 'Fen',
        handle: 'fen',
        modelId: 'gpt-5.6-terra',
        runtimeId: 'codex',
        serverId,
    });
    const captainChatId = (await openCaptainChat(owner, { agentId: created.agent.id, serverId }))
        .id;

    // A normal DM send arms durable delivery for an active Agent.
    await owner.trpc.chat.send.mutate({
        chatId: captainChatId,
        content: 'Hello Fen',
        nonce: crypto.randomUUID(),
        serverId,
    });
    const armed = (await harness.sql`
        select agent_id from agent_delivery where agent_id = ${created.agent.id}
    `) as { agent_id: string }[];
    expect(armed).toEqual([{ agent_id: created.agent.id }]);

    const update = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    const subscription = member.trpc.agent.onUpdated.subscribe(
        { serverId },
        {
            onData: () => update.resolve(),
            onError: (error) => update.reject(error),
            onStarted: () => started.resolve(),
        }
    );
    await started.promise;

    await owner.trpc.agent.delete.mutate({
        agentId: created.agent.id,
        confirmation: 'Fen',
        serverId,
    });
    await update.promise;
    subscription.unsubscribe();

    // The DM leaves active navigation with the Agent, while its durable
    // transcript remains readable by stable Chat id.
    expect(await owner.trpc.agent.list.query({ serverId })).toEqual([]);
    const listed = (await owner.trpc.chat.list.query({ serverId })).find(
        (chat) => chat.id === captainChatId
    );
    expect(listed).toBeUndefined();
    const transcript = await owner.trpc.chat.messages.query({
        chatId: captainChatId,
        limit: 50,
        serverId,
    });
    expect(transcript.messages).toContainEqual(expect.objectContaining({ content: 'Hello Fen' }));

    await expect(
        owner.trpc.chat.send.mutate({
            chatId: captainChatId,
            content: 'Still there?',
            nonce: crypto.randomUUID(),
            serverId,
        })
    ).rejects.toThrow(/retired/u);
    await expect(
        owner.trpc.claim.create.mutate({
            chatId: captainChatId,
            content: 'Claim the retired Agent',
            nonce: crypto.randomUUID(),
            serverId,
        })
    ).rejects.toThrow(/retired/u);
    const delivery = await harness.sql`
        select agent_id from agent_delivery where agent_id = ${created.agent.id}
    `;
    const pending = await harness.sql`
        select id from agent_inbox where agent_id = ${created.agent.id}
    `;
    expect(delivery).toEqual([]);
    expect(pending).toEqual([]);
    const stored = (await harness.sql`
        select content from chat_messages
        where chat_id = ${captainChatId} and author_user_id = ${ownerUserId}
          and content in ('Still there?', 'Claim the retired Agent')
    `) as { content: string }[];
    expect(stored).toEqual([]);
});

test('releases a retired Agent handle without conflating the replacement identity', async () => {
    const original = await createHomedAgent(owner, {
        computerId: computerB,
        displayName: 'Echo',
        handle: 'echo',
        modelId: 'gpt-5.6-terra',
        runtimeId: 'codex',
        serverId,
    });
    const originalChat = await openCaptainChat(owner, { agentId: original.agent.id, serverId });

    await expect(
        createHomedAgent(owner, {
            computerId: computerB,
            displayName: 'Other Echo',
            handle: 'echo',
            modelId: 'gpt-5.6-terra',
            runtimeId: 'codex',
            serverId,
        })
    ).rejects.toThrow(/already taken/u);

    await owner.trpc.agent.delete.mutate({
        agentId: original.agent.id,
        confirmation: original.agent.displayName,
        serverId,
    });

    const replacement = await createHomedAgent(owner, {
        computerId: computerB,
        displayName: 'Echo',
        handle: 'echo',
        modelId: 'gpt-5.6-terra',
        runtimeId: 'codex',
        serverId,
    });
    const replacementChat = await openCaptainChat(owner, {
        agentId: replacement.agent.id,
        serverId,
    });

    expect(replacement.agent.id).not.toBe(original.agent.id);
    expect(replacementChat.id).not.toBe(originalChat.id);
    expect(await owner.trpc.agent.list.query({ serverId })).toEqual([
        expect.objectContaining({ handle: 'echo', id: replacement.agent.id }),
    ]);

    const visibleChatIds = (await owner.trpc.chat.list.query({ serverId })).map((chat) => chat.id);
    expect(visibleChatIds).toContain(replacementChat.id);
    expect(visibleChatIds).not.toContain(originalChat.id);

    const identities = (await harness.sql`
        select id, handle, retired_at
        from agents
        where server_id = ${serverId} and lower(handle) = 'echo'
        order by retired_at nulls last
    `) as Array<{ handle: string; id: string; retired_at: Date | null }>;
    expect(identities).toEqual([
        { handle: 'echo', id: original.agent.id, retired_at: expect.any(Date) },
        { handle: 'echo', id: replacement.agent.id, retired_at: null },
    ]);

    await owner.trpc.agent.delete.mutate({
        agentId: replacement.agent.id,
        confirmation: replacement.agent.displayName,
        serverId,
    });
});

async function insertComputer(
    computerServerId: string,
    computerId: string,
    hash: string,
    inventory: unknown
) {
    await harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash, reported_inventory, health)
        values (
            ${computerId},
            ${computerServerId},
            ${ownerUserId},
            ${hash},
            ${inventory}::jsonb,
            'healthy'
        )
    `;
}

async function signIn(subject: string) {
    const token = await harness.humans.mintSessionToken(subject);
    return createHausClient(harness, token);
}

async function readUserId(subject: string) {
    const rows = (await harness.sql`
        select id from users where auth_subject = ${subject}
    `) as { id: string }[];
    return rows[0].id;
}
