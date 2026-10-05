import { afterAll, beforeAll, expect, test } from 'bun:test';
import { hausAgentVersion } from '@haus/api';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

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
const piRuntime = { id: 'pi', label: 'Pi', models: [{ id: 'pi', label: 'Pi' }] };

beforeAll(async () => {
    harness = await startHausServerHarness();
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

    // Computer A reports Codex; Computer B reports only Pi; a foreign Server owns its own Computer.
    await insertComputer(serverId, computerA, credentialHash, { runtimes: [codexRuntime] });
    await insertComputer(serverId, computerB, otherCredentialHash, { runtimes: [piRuntime] });
    await insertComputer(foreign.id, foreignComputer, foreignCredentialHash, {
        runtimes: [codexRuntime],
    });
});

afterAll(async () => {
    owner.close();
    member.close();
    await harness.close();
});

test('keeps a new Server Agent-free until an Owner explicitly provisions one', async () => {
    const agents = await owner.trpc.agent.list.query({ serverId });
    expect(agents).toEqual([]);
});

test('reserves the Cove identity from ordinary Agent creation', async () => {
    await expect(
        owner.trpc.agent.create.mutate({
            computerId: computerA,
            description: 'Not the onboarding factory Agent.',
            displayName: 'Cove',
            handle: 'cove',
            modelId: 'gpt-5.6-sol',
            runtimeId: 'codex',
            serverId,
        })
    ).rejects.toThrow(/reserved by Haus/i);
});

test('provisions an ordinary Agent without pre-creating an Owner DM', async () => {
    const created = await owner.trpc.agent.create.mutate({
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
        factoryKind: 'ordinary',
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
    const chats = await owner.trpc.chat.list.query({ serverId });
    expect(chats.some((chat) => chat.peerAgentId === created.agent.id)).toBe(false);

    const agents = await owner.trpc.agent.list.query({ serverId });
    expect(agents.map((agent) => agent.handle)).toEqual(['scout']);
    expect(agents[0]).toMatchObject({ avatarUrl: null, handle: 'scout' });
    expect(agents[0]).not.toHaveProperty('archetype');
    expect(agents[0]?.dmChatId).toBeNull();
    expect(await owner.trpc.agent.get.query({ agentId: created.agent.id, serverId })).toEqual(
        agents[0]
    );
});

test('materializes one canonical Agent DM only when requested', async () => {
    const [agent] = await owner.trpc.agent.list.query({ serverId });
    if (!agent) {
        throw new Error('Expected the provisioned Agent.');
    }

    const [first, retry] = await Promise.all([
        owner.trpc.chat.ensureAgentDm.mutate({ agentId: agent.id, serverId }),
        owner.trpc.chat.ensureAgentDm.mutate({ agentId: agent.id, serverId }),
    ]);

    expect(retry.id).toBe(first.id);
    expect(
        (await owner.trpc.chat.list.query({ serverId })).filter(
            (chat) => chat.peerAgentId === agent.id
        )
    ).toHaveLength(1);
});

test('first human sends materialize exactly one pair DM under retries and per-human isolation', async () => {
    const created = await owner.trpc.agent.create.mutate({
        computerId: computerB,
        displayName: 'Relay',
        handle: 'relay',
        modelId: 'pi',
        runtimeId: 'pi',
        serverId,
    });
    const input = {
        agentId: created.agent.id,
        content: 'Materialize once.',
        nonce: 'implicit-agent-dm-retry',
        serverId,
        targetKind: 'agent-dm' as const,
    };
    const [first, retry] = await Promise.all([
        owner.trpc.chat.send.mutate(input),
        owner.trpc.chat.send.mutate(input),
    ]);

    expect(retry.message.id).toBe(first.message.id);
    expect([first.idempotent, retry.idempotent].sort()).toEqual([false, true]);
    const ownerDmId = first.message.chatId;
    expect(
        (await owner.trpc.chat.list.query({ serverId })).filter(
            (chat) => chat.peerAgentId === created.agent.id
        )
    ).toHaveLength(1);

    const memberSend = await member.trpc.chat.send.mutate({
        agentId: created.agent.id,
        content: 'A separate private pair.',
        nonce: 'implicit-agent-dm-member',
        serverId,
        targetKind: 'agent-dm',
    });
    expect(memberSend.message.chatId).not.toBe(ownerDmId);
    expect(
        (
            await harness.sql`
            select count(*)::int as count from chats
            where server_id = ${serverId} and dm_agent_id = ${created.agent.id}
        `
        )[0]?.count
    ).toBe(2);
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

    await expect(
        member.trpc.agent.executionJournal.query({
            agentId: agent.id,
            runId: 'run_detail',
            serverId,
        })
    ).rejects.toThrow(/Owner or Admin/i);

    await expect(
        owner.trpc.agent.executionJournal.query({
            agentId: agent.id,
            runId: 'run_detail',
            serverId,
        })
    ).resolves.toMatchObject({ reason: 'offline', status: 'unavailable' });
});

test('fails closed on a runtime or model the assigned Computer never reported', async () => {
    await expect(
        owner.trpc.agent.create.mutate({
            computerId: computerA,
            displayName: 'Ghost',
            handle: 'ghost',
            modelId: 'gpt-9-imaginary',
            runtimeId: 'codex',
            serverId,
        })
    ).rejects.toThrow(/does not report the model/i);

    // Pi lives only on Computer B, so referencing it on Computer A fails closed.
    await expect(
        owner.trpc.agent.create.mutate({
            computerId: computerA,
            displayName: 'Ghost',
            handle: 'ghost',
            modelId: 'pi',
            runtimeId: 'pi',
            serverId,
        })
    ).rejects.toThrow(/does not report the runtime/i);
});

test('fails closed when configuration references another Server’s Computer', async () => {
    await expect(
        owner.trpc.agent.create.mutate({
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
        member.trpc.agent.create.mutate({
            computerId: computerA,
            displayName: 'Nope',
            handle: 'nope',
            modelId: 'gpt-5.6-sol',
            runtimeId: 'codex',
            serverId,
        })
    ).rejects.toThrow(/Owner or Admin/i);
});

test('saves desired config from last inventory while the Computer is offline, immutably assigned', async () => {
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
        select id from chat_messages where chat_id = ${agent.dmChatId}
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
    ).rejects.toThrow(/does not report the model/i);
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
        insert into message_tasks (
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
    ).rejects.toThrow(/Delete every assigned Agent/i);
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
        from message_tasks
        where server_id = ${serverId} and message_id = 'msg_agent_tombstone'
    `) as Array<{
        assignee_agent_id: string | null;
        claimed_at: Date | null;
        version: number;
    }>;
    expect(released).toEqual([{ assignee_agent_id: null, claimed_at: null, version: 2 }]);
    const taskEvents = (await harness.sql`
        select event_type from chat_events
        where server_id = ${serverId} and message_id = 'msg_agent_tombstone'
        order by cursor
    `) as Array<{ event_type: string }>;
    expect(taskEvents.map((event) => event.event_type)).toEqual(['task.updated']);

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
    const created = await owner.trpc.agent.create.mutate({
        computerId: computerB,
        displayName: 'Fen',
        handle: 'fen',
        modelId: 'pi',
        runtimeId: 'pi',
        serverId,
    });
    const dmChatId = (
        await owner.trpc.chat.ensureAgentDm.mutate({ agentId: created.agent.id, serverId })
    ).id;

    // A normal DM send arms durable delivery for an active Agent.
    await owner.trpc.chat.send.mutate({
        chatId: dmChatId,
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
    const subscription = member.trpc.server.onUpdate.subscribe(
        { serverId },
        {
            onData: (event) => {
                if (event.scope === 'agent') {
                    update.resolve();
                }
            },
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
        (chat) => chat.id === dmChatId
    );
    expect(listed).toBeUndefined();
    const transcript = await owner.trpc.chat.messages.query({
        chatId: dmChatId,
        limit: 50,
        serverId,
    });
    expect(transcript.messages).toContainEqual(expect.objectContaining({ content: 'Hello Fen' }));

    await expect(
        owner.trpc.chat.send.mutate({
            chatId: dmChatId,
            content: 'Still there?',
            nonce: crypto.randomUUID(),
            serverId,
        })
    ).rejects.toThrow(/retired/u);
    await expect(
        owner.trpc.task.create.mutate({
            chatId: dmChatId,
            content: 'Task the retired Agent',
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
        where chat_id = ${dmChatId} and author_user_id = ${ownerUserId}
          and content in ('Still there?', 'Task the retired Agent')
    `) as { content: string }[];
    expect(stored).toEqual([]);
});

test('releases a retired Agent handle without conflating the replacement identity', async () => {
    const original = await owner.trpc.agent.create.mutate({
        computerId: computerB,
        displayName: 'Echo',
        handle: 'echo',
        modelId: 'pi',
        runtimeId: 'pi',
        serverId,
    });
    const originalChat = await owner.trpc.chat.ensureAgentDm.mutate({
        agentId: original.agent.id,
        serverId,
    });

    await expect(
        owner.trpc.agent.create.mutate({
            computerId: computerB,
            displayName: 'Other Echo',
            handle: 'echo',
            modelId: 'pi',
            runtimeId: 'pi',
            serverId,
        })
    ).rejects.toThrow(/already taken/u);

    await owner.trpc.agent.delete.mutate({
        agentId: original.agent.id,
        confirmation: original.agent.displayName,
        serverId,
    });

    const replacement = await owner.trpc.agent.create.mutate({
        computerId: computerB,
        displayName: 'Echo',
        handle: 'echo',
        modelId: 'pi',
        runtimeId: 'pi',
        serverId,
    });
    const replacementChat = await owner.trpc.chat.ensureAgentDm.mutate({
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

async function signIn(clerkUserId: string) {
    const token = await harness.clerk.mintSessionToken(clerkUserId);
    return createHausClient(harness, token);
}

async function readUserId(clerkUserId: string) {
    const rows = (await harness.sql`
        select id from users where clerk_user_id = ${clerkUserId}
    `) as { id: string }[];
    return rows[0].id;
}
