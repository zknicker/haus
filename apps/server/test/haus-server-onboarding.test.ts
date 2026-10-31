import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { computerBootstrapProtocolVersion, computerProtocolVersion } from '@haus/api';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let owner: HausClient;
const credential = 'onboarding-computer-credential-0000000000';

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = createHausClient(
        harness,
        await harness.humans.mintSessionToken('user_onboarding_owner')
    );
});

afterAll(async () => {
    owner.close();
    await harness.close();
});

test('Computer reports advance durable onboarding only after usable inventory', async () => {
    const created = await owner.trpc.server.create.mutate({
        displayName: 'Onboarding HQ',
        slug: 'onboarding-hq',
    });
    const setup = await createComputerAttachment();
    const socket = await connectComputer();

    await expectOnboarding('awaiting-computer', {
        computerId: setup.computerId,
        failure: null,
    });

    socket.send(JSON.stringify({ inventory: { runtimes: [] }, type: 'report' }));
    await expectOnboarding('awaiting-computer', {
        failure: {
            code: 'inventory-empty',
            detail: 'This Computer did not report a usable runtime and model.',
        },
    });

    socket.send(
        JSON.stringify({
            inventory: {
                runtimes: [
                    {
                        id: 'codex',
                        label: 'Codex',
                        models: [{ id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' }],
                    },
                ],
            },
            type: 'report',
        })
    );
    await expectOnboarding('awaiting-cove', {
        computerId: setup.computerId,
        failure: null,
    });

    const otherCredential = 'other-onboarding-computer-credential-00000';
    await createComputerAttachment(created.slug, otherCredential);
    const otherSocket = await connectComputer(otherCredential);
    otherSocket.send(
        JSON.stringify({
            inventory: {
                runtimes: [
                    {
                        id: 'other',
                        label: 'Other',
                        models: [{ id: 'other-model', label: 'Other model' }],
                    },
                ],
            },
            type: 'report',
        })
    );
    await Bun.sleep(50);
    await expectOnboarding('awaiting-cove', {
        computerId: setup.computerId,
        failure: null,
    });
    otherSocket.close();

    const token = owner.sessionToken;
    await harness.restart();
    owner.close();
    owner = createHausClient(harness, token);
    await expectOnboarding('awaiting-cove', {
        failure: {
            code: 'computer-disconnected',
            detail: 'The Computer disconnected. Run setup again on that Computer.',
        },
    });

    socket.close();
    const reconnected = await connectComputer();
    await expectOnboarding('awaiting-cove', { failure: null });
    await owner.trpc.computer.remove.mutate({
        computerId: setup.computerId,
        confirmation: 'REMOVE',
        serverId: created.id,
    });
    await expectOnboarding('awaiting-computer', { computerId: null, failure: null });
    reconnected.close();

    async function expectOnboarding(
        phase: 'awaiting-computer' | 'awaiting-cove',
        expected: { computerId?: string | null; failure: unknown }
    ) {
        expect(await waitForOnboarding(created.slug, { phase, ...expected })).toMatchObject({
            phase,
            ...expected,
        });
    }
});
test('incompatible and invalid Computer reports stay actionable', async () => {
    const created = await owner.trpc.server.create.mutate({
        displayName: 'Repair HQ',
        slug: 'repair-hq',
    });
    const repairCredential = 'repair-computer-credential-00000000000000';
    const setup = await createComputerAttachment('repair-hq', repairCredential);
    const socket = await connectComputer(repairCredential, computerProtocolVersion - 1);

    expect(
        await waitForOnboarding(created.slug, {
            computerId: setup.computerId,
            failure: {
                code: 'computer-incompatible',
                detail: 'Update Haus Computer before continuing setup.',
            },
            phase: 'awaiting-computer',
        })
    ).toMatchObject({
        computerId: setup.computerId,
        failure: {
            code: 'computer-incompatible',
            detail: 'Update Haus Computer before continuing setup.',
        },
        phase: 'awaiting-computer',
    });
    socket.close();
    await Bun.sleep(50);

    const repaired = await connectComputer(repairCredential);
    repaired.send(
        JSON.stringify({ inventory: { runtimes: [{ id: '', models: [] }] }, type: 'report' })
    );
    expect(
        await waitForOnboarding(created.slug, {
            failure: {
                code: 'inventory-invalid',
                detail: 'The Computer reported invalid inventory. Update it and reconnect.',
            },
        })
    ).toMatchObject({
        failure: {
            code: 'inventory-invalid',
            detail: 'The Computer reported invalid inventory. Update it and reconnect.',
        },
        phase: 'awaiting-computer',
    });
    repaired.close();
});
test('creates and applies one immutable Cove through a replayable Computer operation', async () => {
    const created = await owner.trpc.server.create.mutate({
        displayName: 'Cove HQ',
        slug: 'cove-hq',
    });
    const coveCredential = 'cove-computer-credential-000000000000000';
    const setup = await createComputerAttachment(created.slug, coveCredential);
    let socket = await connectComputer(coveCredential);
    socket.send(
        JSON.stringify({
            inventory: {
                runtimes: [
                    {
                        id: 'codex',
                        label: 'Codex',
                        models: [{ id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' }],
                    },
                ],
            },
            type: 'report',
        })
    );
    await waitForOnboarding(created.slug, { phase: 'awaiting-cove' });

    const firstApplication = nextSocketFrame(socket, 'cove-apply');
    const first = await owner.trpc.server.createCove.mutate({
        computerId: setup.computerId,
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId: created.id,
    });
    expect(first).toMatchObject({
        agent: {
            computerId: setup.computerId,
            description: 'Onboarding Assistant',
            displayName: 'Cove',
            dmChatId: null,
            factoryKind: 'cove',
            handle: 'cove',
        },
        channelId: created.onboarding.channelId,
        phase: 'applying',
    });

    const [ownerStanding] = await harness.sql`
        select membership.user_id, membership.stint::int as stint
        from server_memberships membership
        join users on users.id = membership.user_id
        where membership.server_id = ${created.id}
          and users.auth_subject = 'user_onboarding_owner'
          and membership.revoked_at is null
    `;
    const ownerStint = ownerStanding?.stint;
    const ownerUserId = ownerStanding?.user_id;
    expect(ownerStint).toBe(1);
    expect(ownerUserId).toMatch(/^usr_/u);
    const coveDmRows = await harness.sql`
        select c.id, c.kind, c.dm_agent_id, c.dm_member_one_user_id,
               c.dm_member_one_stint, c.dm_member_two_user_id, c.dm_member_two_stint
        from chats c
        where c.server_id = ${created.id} and c.dm_agent_id = ${first.agent.id}
    `;
    expect(coveDmRows).toEqual([]);
    expect(
        (await owner.trpc.chat.list.query({ serverId: created.id })).some(
            (chat) => chat.peerAgentId === first.agent.id
        )
    ).toBe(false);

    const command = await firstApplication;
    expect(command).toMatchObject({
        agentId: first.agent.id,
        applicationId: first.applicationId,
        factoryKind: 'cove',
        type: 'cove-apply',
    });

    socket.send(
        JSON.stringify({
            agentId: first.agent.id,
            applicationId: first.applicationId,
            error: 'Workspace application failed.',
            factoryKind: 'cove',
            status: 'failed',
            type: 'cove-apply-result',
        })
    );
    await waitForOnboarding(created.slug, {
        failure: { code: 'application-failed', detail: 'Workspace application failed.' },
    });
    socket.send(
        JSON.stringify({
            inventory: {
                runtimes: [
                    {
                        id: 'codex',
                        label: 'Codex',
                        models: [{ id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' }],
                    },
                ],
            },
            type: 'report',
        })
    );
    expect(
        await waitForOnboarding(created.slug, {
            failure: { code: 'application-failed', detail: 'Workspace application failed.' },
        })
    ).toMatchObject({ phase: 'applying' });

    socket.close();
    await Bun.sleep(50);
    const replayFrames: Record<string, unknown>[] = [];
    socket = await connectComputer(coveCredential, computerProtocolVersion, replayFrames);
    await waitForFrame(replayFrames, 'cove-apply');
    expect(replayFrames.filter((frame) => frame.type === 'cove-apply')).toHaveLength(1);
    expect(replayFrames.some((frame) => frame.type === 'agent-configure')).toBe(false);
    expect(replayFrames.some((frame) => frame.type === 'start')).toBe(false);
    await expect(
        owner.trpc.agent.configure.mutate({
            agentId: first.agent.id,
            modelId: 'gpt-5.6-sol',
            runtimeId: 'codex',
            serverId: created.id,
        })
    ).rejects.toThrow(/setup must finish/u);
    expect(replayFrames.some((frame) => frame.type === 'agent-configure')).toBe(false);

    const retry = await owner.trpc.server.createCove.mutate({
        computerId: setup.computerId,
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId: created.id,
    });
    expect(retry).toEqual(first);
    const concurrent = await Promise.all([
        owner.trpc.server.createCove.mutate({
            computerId: setup.computerId,
            modelId: 'gpt-5.6-sol',
            runtimeId: 'codex',
            serverId: created.id,
        }),
        owner.trpc.server.createCove.mutate({
            computerId: setup.computerId,
            modelId: 'gpt-5.6-sol',
            runtimeId: 'codex',
            serverId: created.id,
        }),
    ]);
    expect(concurrent).toEqual([first, first]);
    const [coveDmCountAfterRetries] = await harness.sql`
        select count(*)::int as count from chats
        where server_id = ${created.id} and kind = 'dm' and dm_agent_id = ${first.agent.id}
    `;
    expect(coveDmCountAfterRetries?.count).toBe(0);
    await expect(
        owner.trpc.server.createCove.mutate({
            computerId: setup.computerId,
            modelId: 'different-model',
            runtimeId: 'codex',
            serverId: created.id,
        })
    ).rejects.toThrow(/configuration is already locked/i);

    socket.send(
        JSON.stringify({
            agentId: first.agent.id,
            applicationId: first.applicationId,
            factoryKind: 'cove',
            status: 'applied',
            type: 'cove-apply-result',
        })
    );
    const greetingStart = await waitForFrame(replayFrames, 'start');
    const completed = await waitForOnboarding(created.slug, { phase: 'complete' });
    expect(completed).toMatchObject({
        agentId: first.agent.id,
        applicationId: first.applicationId,
        channelId: created.onboarding.channelId,
        failure: null,
    });
    expect(greetingStart).toMatchObject({
        agentId: first.agent.id,
        chatId: created.onboarding.channelId,
        inbox: [
            {
                content: expect.stringContaining('Greet the owner'),
                id: first.applicationId,
                senderHandle: 'onboarding',
                senderType: 'system',
                target: '#onboarding-owner',
            },
        ],
        type: 'start',
    });
    expect(replayFrames.filter((frame) => frame.type === 'start')).toHaveLength(1);
    const [beforeGreeting] = await harness.sql`
        select count(*)::int as count from chat_messages
        where server_id = ${created.id} and chat_id = ${created.onboarding.channelId}
    `;
    expect(beforeGreeting?.count).toBe(0);

    socket.send(
        JSON.stringify({
            agentId: first.agent.id,
            endedAt: new Date().toISOString(),
            messageCount: 0,
            modelId: greetingStart.modelId,
            outputProduced: false,
            runId: greetingStart.runId,
            runtimeId: greetingStart.runtimeId,
            startedAt: new Date().toISOString(),
            status: 'failed',
            summary: 'provider unavailable',
            tokenUsage: null,
            activity: { operations: [] },
            type: 'turn',
        })
    );
    await waitForInboxItems(first.agent.id, 1);
    expect((await owner.trpc.server.bySlug.query({ slug: created.slug })).onboarding.phase).toBe(
        'complete'
    );
    await Bun.sleep(50);
    expect(replayFrames.filter((frame) => frame.type === 'start')).toHaveLength(1);

    await owner.trpc.agent.start.mutate({ agentId: first.agent.id, serverId: created.id });
    const retryStart = await waitForFrameCount(replayFrames, 'start', 2);
    expect(retryStart.inbox).toEqual(greetingStart.inbox);

    const runnerToken = await mintRunner({
        agentId: first.agent.id,
        chatId: created.onboarding.channelId,
        credentialHash: createHash('sha256').update(coveCredential).digest('hex'),
        runId: String(retryStart.runId),
    });
    const sentGreeting = await sendAgentMessage(runnerToken, {
        content: 'Hi, I’m Cove. Let’s turn your first idea into real work.',
        nonce: `cove-greeting:${first.applicationId}`,
        target: '#onboarding-owner',
    });
    expect(sentGreeting).toMatchObject({
        message: {
            chat_id: created.onboarding.channelId,
            sender: { handle: 'cove', type: 'agent' },
        },
    });
    const greetingHistory = await owner.trpc.chat.messages.query({
        chatId: created.onboarding.channelId,
        serverId: created.id,
    });
    expect(greetingHistory.messages).toEqual([
        expect.objectContaining({
            author: expect.objectContaining({ agentId: first.agent.id, kind: 'agent' }),
            content: 'Hi, I’m Cove. Let’s turn your first idea into real work.',
        }),
    ]);

    socket.send(
        JSON.stringify({
            agentId: first.agent.id,
            endedAt: new Date().toISOString(),
            messageCount: 1,
            modelId: retryStart.modelId,
            outputProduced: true,
            runId: retryStart.runId,
            runtimeId: retryStart.runtimeId,
            startedAt: new Date().toISOString(),
            status: 'completed',
            summary: 'greeted',
            tokenUsage: null,
            activity: { operations: [] },
            type: 'turn',
        })
    );
    await waitForInboxItems(first.agent.id, 0);
    const [cursorRows] = await harness.sql`
        select count(*)::int as count from agent_inbox_cursors
        where server_id = ${created.id} and agent_id = ${first.agent.id}
    `;
    expect(cursorRows?.count).toBe(0);

    socket.send(
        JSON.stringify({
            agentId: first.agent.id,
            applicationId: first.applicationId,
            factoryKind: 'cove',
            status: 'applied',
            type: 'cove-apply-result',
        })
    );
    await Bun.sleep(50);
    const [coveDmCountAfterApplyReplay] = await harness.sql`
        select count(*)::int as count from chats
        where server_id = ${created.id} and kind = 'dm' and dm_agent_id = ${first.agent.id}
    `;
    expect(coveDmCountAfterApplyReplay?.count).toBe(0);
    socket.close();
    await Bun.sleep(50);
    const settledReplayFrames: Record<string, unknown>[] = [];
    socket = await connectComputer(coveCredential, computerProtocolVersion, settledReplayFrames);
    await waitForFrame(settledReplayFrames, 'agent-configure');
    await Bun.sleep(50);
    expect(settledReplayFrames.some((frame) => frame.type === 'start')).toBe(false);
    expect(await countInboxItems(first.agent.id)).toBe(0);

    const [agentRow] = await harness.sql`
        select a.handle, a.display_name, a.description, a.computer_id,
               a.desired_runtime_id, a.desired_model_id, a.factory_kind,
               av.sha256, av.bytes
        from agents a
        join avatars av on av.id = a.avatar_id
        where a.server_id = ${created.id}
    `;
    expect(agentRow).toMatchObject({
        computer_id: setup.computerId,
        description: 'Onboarding Assistant',
        desired_model_id: 'gpt-5.6-sol',
        desired_runtime_id: 'codex',
        display_name: 'Cove',
        factory_kind: 'cove',
        handle: 'cove',
        sha256: '73edd5cb230228272dafa65ce2aa1481bf4911afa9e3ca577ebf28d2e247509e',
    });
    expect(Buffer.from(agentRow?.bytes as Uint8Array).byteLength).toBe(1_459_587);

    const [participant] = await harness.sql`
        select agent_id from channel_agent_participants
        where server_id = ${created.id} and chat_id = ${created.onboarding.channelId}
    `;
    expect(participant?.agent_id).toBe(first.agent.id);
    await expect(
        owner.trpc.agent.updateProfile.mutate({
            agentId: first.agent.id,
            description: 'Changed',
            displayName: 'Changed',
            serverId: created.id,
        })
    ).rejects.toThrow(/product-owned identity/u);
    await expect(
        owner.trpc.avatar.clear.mutate({
            serverId: created.id,
            target: { agentId: first.agent.id, kind: 'agent' },
        })
    ).rejects.toThrow(/product-owned avatar/u);
    const resetFrame = nextSocketFrame(socket, 'agent-reset');
    await owner.trpc.agent.reset.mutate({
        agentId: first.agent.id,
        kind: 'full',
        serverId: created.id,
    });
    expect(await resetFrame).toMatchObject({
        agentId: first.agent.id,
        kind: 'full',
        type: 'agent-reset',
    });

    await owner.trpc.agent.delete.mutate({
        agentId: first.agent.id,
        confirmation: 'Cove',
        serverId: created.id,
    });
    expect(await owner.trpc.agent.list.query({ serverId: created.id })).toEqual([]);
    const afterDeletion = await owner.trpc.server.bySlug.query({ slug: created.slug });
    expect(afterDeletion.onboarding).toMatchObject({
        agentId: first.agent.id,
        applicationId: first.applicationId,
        channelId: created.onboarding.channelId,
        phase: 'complete',
    });
    expect(afterDeletion.channels.filter((channel) => channel.name === 'onboarding-owner')).toEqual(
        [{ id: created.onboarding.channelId, name: 'onboarding-owner' }]
    );
    expect(
        (
            await owner.trpc.chat.messages.query({
                chatId: created.onboarding.channelId,
                serverId: created.id,
            })
        ).messages
    ).toEqual([
        expect.objectContaining({
            author: expect.objectContaining({ agentId: first.agent.id, kind: 'agent' }),
            content: 'Hi, I’m Cove. Let’s turn your first idea into real work.',
        }),
    ]);
    await expect(
        owner.trpc.server.createCove.mutate({
            computerId: setup.computerId,
            modelId: 'gpt-5.6-sol',
            runtimeId: 'codex',
            serverId: created.id,
        })
    ).rejects.toThrow(/Cove/u);

    const socketClosed = nextSocketClose(socket);
    await owner.trpc.computer.remove.mutate({
        computerId: setup.computerId,
        confirmation: 'REMOVE',
        serverId: created.id,
    });
    expect(await socketClosed).toMatchObject({ code: 4000, reason: 'Computer removed' });
    const removedComputers = await owner.trpc.computer.list.query({ serverId: created.id });
    expect(removedComputers).toEqual([]);

    socket.close();
});

async function createComputerAttachment(slug = 'onboarding-hq', secret = credential) {
    const started = await fetch(new URL('/computer/login', harness.url), {
        body: JSON.stringify({ origin: harness.url.origin, purpose: 'setup' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    expect(started.status).toBe(200);
    const grant = (await started.json()) as { deviceCode: string; userCode: string };
    await owner.trpc.computer.login.approve.mutate({ userCode: grant.userCode });
    const exchanged = await fetch(new URL('/computer/login/poll', harness.url), {
        body: JSON.stringify({ deviceCode: grant.deviceCode }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    expect(exchanged.status).toBe(200);
    const session = (await exchanged.json()) as { accessToken: string };
    const attached = await fetch(new URL('/computer/attach', harness.url), {
        body: JSON.stringify({
            accessToken: session.accessToken,
            credentialHash: createHash('sha256').update(secret).digest('hex'),
            idempotencyKey: `cak_${createHash('sha256').update(`${slug}:${secret}`).digest('base64url')}`,
            slug,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    expect(attached.status).toBe(200);
    const completed = await fetch(new URL('/computer/login/complete', harness.url), {
        body: JSON.stringify({ accessToken: session.accessToken }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    expect(completed.status).toBe(200);
    return (await attached.json()) as { computerId: string; serverId: string };
}

async function connectComputer(
    secret = credential,
    protocolVersion = computerProtocolVersion,
    frames?: Record<string, unknown>[]
) {
    const url = new URL('/computer/attachment', harness.url);
    url.protocol = 'ws:';
    const socket = new WebSocket(url);
    if (frames) {
        socket.addEventListener('message', (event) => {
            frames.push(JSON.parse(String(event.data)) as Record<string, unknown>);
        });
    }
    await new Promise<void>((resolve, reject) => {
        socket.addEventListener('open', () => resolve(), { once: true });
        socket.addEventListener('error', () => reject(new Error('Computer socket failed.')), {
            once: true,
        });
    });
    socket.send(
        JSON.stringify({
            architecture: 'arm64',
            bootstrapProtocolVersion: computerBootstrapProtocolVersion,
            credential: secret,
            health: 'healthy',
            operatingSystem: 'darwin',
            productVersion: '1.0.0',
            protocolVersion,
            type: 'bootstrap',
            update: {
                detail: null,
                phase: 'idle',
                targetVersion: null,
                updatedAt: new Date().toISOString(),
            },
        })
    );
    await new Promise<void>((resolve, reject) => {
        socket.addEventListener('message', () => resolve(), { once: true });
        socket.addEventListener(
            'close',
            (event) => reject(new Error(`Computer socket closed ${event.code}: ${event.reason}`)),
            { once: true }
        );
    });
    return socket;
}

async function waitForFrame(frames: Record<string, unknown>[], type: string) {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
        const frame = frames.find((candidate) => candidate.type === type);
        if (frame) {
            return frame;
        }
        await Bun.sleep(10);
    }
    throw new Error(`No ${type} frame arrived.`);
}

async function waitForFrameCount(frames: Record<string, unknown>[], type: string, count: number) {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
        const matches = frames.filter((candidate) => candidate.type === type);
        if (matches.length >= count) {
            return matches[count - 1] as Record<string, unknown>;
        }
        await Bun.sleep(10);
    }
    throw new Error(
        `Only ${frames.filter((frame) => frame.type === type).length} ${type} frames arrived.`
    );
}

/** Work still awaiting a turn. Settled `seen` rows are retained turn evidence. */
async function countInboxItems(agentId: string) {
    const [row] = await harness.sql`
        select count(*)::int as count
        from agent_inbox
        where agent_id = ${agentId} and state <> 'seen'
    `;
    return Number(row?.count ?? 0);
}

async function mintRunner(input: {
    agentId: string;
    chatId: string;
    credentialHash: string;
    runId: string;
}) {
    const response = await fetch(new URL('/computer/runner/mint', harness.url), {
        body: JSON.stringify(input),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    if (!response.ok) {
        throw new Error(`Runner mint failed: ${response.status}`);
    }
    return ((await response.json()) as { runnerToken: string }).runnerToken;
}

async function sendAgentMessage(
    token: string,
    input: { content: string; nonce: string; target: string }
) {
    const response = await fetch(new URL('/api/agent/messages/send', harness.url), {
        body: JSON.stringify(input),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    if (!response.ok) {
        throw new Error(`Agent send failed: ${response.status}`);
    }
    return (await response.json()) as Record<string, unknown>;
}

async function waitForInboxItems(agentId: string, expected: number) {
    const deadline = Date.now() + 3000;
    let count = await countInboxItems(agentId);
    while (Date.now() < deadline && count !== expected) {
        await Bun.sleep(10);
        count = await countInboxItems(agentId);
    }
    expect(count).toBe(expected);
}

async function waitForOnboarding(slug: string, expected: Record<string, unknown>) {
    const deadline = Date.now() + 3000;
    let onboarding = (await owner.trpc.server.bySlug.query({ slug })).onboarding;
    while (Date.now() < deadline) {
        const matches = Object.entries(expected).every(
            ([key, value]) =>
                JSON.stringify(onboarding[key as keyof typeof onboarding]) === JSON.stringify(value)
        );
        if (matches) {
            return onboarding;
        }
        await Bun.sleep(25);
        onboarding = (await owner.trpc.server.bySlug.query({ slug })).onboarding;
    }
    return onboarding;
}

async function nextSocketFrame(socket: WebSocket, type: string) {
    return await new Promise<Record<string, unknown>>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`No ${type} frame arrived.`)), 3000);
        socket.addEventListener('message', function onMessage(event) {
            const frame = JSON.parse(String(event.data)) as Record<string, unknown>;
            if (frame.type !== type) {
                return;
            }
            clearTimeout(timeout);
            socket.removeEventListener('message', onMessage);
            resolve(frame);
        });
    });
}

async function nextSocketClose(socket: WebSocket) {
    return await new Promise<{ code: number; reason: string }>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Computer socket stayed open.')), 3000);
        socket.addEventListener(
            'close',
            (event) => {
                clearTimeout(timeout);
                resolve({ code: event.code, reason: event.reason });
            },
            { once: true }
        );
    });
}
