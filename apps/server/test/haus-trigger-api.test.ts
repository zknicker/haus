import { afterAll, beforeAll, expect, test } from 'bun:test';
import { triggerBurstLimit } from '../src/triggers/trigger-rate-limit.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let admin: HausClient;
let channelId: string;
let doomedAgentId: string;
let doomedToken: string;
let harness: HausServerHarness;
let member: HausClient;
let outsider: HausClient;
let owner: HausClient;
let peerToken: string;
let sageAgentId: string;
let sageAnchorId: string;
let sageToken: string;
let serverId: string;
let ownerUserId: string;

const computerId = 'cmp_triggerapihost01';
const credentialHash = 'f'.repeat(64);
const codexRuntime = { id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] };

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = await signIn('user_trigger_api_owner');
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Trigger API Server',
        slug: 'trigger-api-server',
    });
    serverId = server.id;
    channelId = server.channels[0].id;
    ownerUserId = await readUserId('user_trigger_api_owner');
    await harness.sql`
        update server_memberships set handle = 'trigger-owner'
        where server_id = ${serverId} and user_id = ${ownerUserId}
    `;
    await harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash, reported_inventory, health)
        values (${computerId}, ${serverId}, ${ownerUserId}, ${credentialHash}, ${{ runtimes: [codexRuntime] }}::jsonb, 'healthy')
    `;
    sageAgentId = await createAgent('Sage', 'sage');
    const peerAgentId = await createAgent('Peer', 'peer');
    doomedAgentId = await createAgent('Doomed', 'doomed');
    for (const id of [sageAgentId, peerAgentId, doomedAgentId]) {
        await harness.sql`
            insert into channel_agent_participants (server_id, chat_id, agent_id)
            values (${serverId}, ${channelId}, ${id})
            on conflict do nothing
        `;
    }
    sageAnchorId = await sendAnchor('Wire the alert to Sage', 'trigger_api_anchor');
    sageToken = await mintRunner(sageAgentId, 'run_trigger_api_sage');
    peerToken = await mintRunner(peerAgentId, 'run_trigger_api_peer');
    doomedToken = await mintRunner(doomedAgentId, 'run_trigger_api_doomed');
    admin = await addHuman('user_trigger_api_admin', 'admin');
    member = await addHuman('user_trigger_api_member', 'member');
    outsider = await signIn('user_trigger_api_outsider');
    await outsider.trpc.server.create.mutate({
        displayName: 'Outsider Server',
        slug: 'trigger-api-outsider',
    });
});

afterAll(async () => {
    owner?.close();
    admin?.close();
    member?.close();
    outsider?.close();
    await harness?.close();
});

test('keeps every Agent to its own triggers', async () => {
    const created = await agentRequest(sageToken, 'POST', '/api/agent/triggers', {
        messageId: sageAnchorId,
        title: 'Sage only',
    });
    const triggerId = created.body.trigger?.id ?? '';

    const peerList = await agentRequest(peerToken, 'GET', '/api/agent/triggers');
    expect(peerList.body.triggers).toEqual([]);
    for (const [method, path] of [
        ['GET', `/api/agent/triggers/${triggerId}`],
        ['GET', `/api/agent/triggers/${triggerId}/log`],
        ['POST', `/api/agent/triggers/${triggerId}/disable`],
        ['POST', `/api/agent/triggers/${triggerId}/rotate`],
        ['DELETE', `/api/agent/triggers/${triggerId}`],
    ] as const) {
        const refused = await agentRequest(peerToken, method, path);
        expect(refused).toMatchObject({ body: { code: 'INVALID_TARGET' }, status: 404 });
    }
    await expect(
        agentRequest(sageToken, 'GET', `/api/agent/triggers/${triggerId}`)
    ).resolves.toMatchObject({ status: 200 });
});

test('refuses an anchor the Agent cannot reach or write', async () => {
    const privateChannel = await owner.trpc.chat.createChannel.mutate({
        agentIds: [doomedAgentId],
        name: 'private-room',
        serverId,
    });
    const unreachable = await owner.trpc.chat.send.mutate({
        chatId: privateChannel.id,
        content: 'Not for Sage',
        nonce: 'trigger_api_private',
        serverId,
    });

    const refused = await agentRequest(sageToken, 'POST', '/api/agent/triggers', {
        messageId: unreachable.message.id,
        title: 'Reaching too far',
    });
    expect(refused.status).toBe(404);

    const archiver = await readUserId('user_trigger_api_owner');
    await harness.sql`
        update chats
        set archived_at = now(), archived_by_user_id = ${archiver}
        where id = ${privateChannel.id}
    `;
    const readOnly = await agentRequest(doomedToken, 'POST', '/api/agent/triggers', {
        messageId: unreachable.message.id,
        title: 'Archived anchor',
    });
    expect(readOnly).toMatchObject({ body: { code: 'TARGET_READ_ONLY' }, status: 409 });
});

test('rotating replaces the secret and retires the old one', async () => {
    const created = await agentRequest(sageToken, 'POST', '/api/agent/triggers', {
        messageId: sageAnchorId,
        title: 'Rotatable',
    });
    const triggerId = created.body.trigger?.id ?? '';

    const rotated = await agentRequest(
        sageToken,
        'POST',
        `/api/agent/triggers/${triggerId}/rotate`
    );

    expect(rotated.body.secret).toMatch(/^grtt_/u);
    expect(rotated.body.secret).not.toBe(created.body.secret);
    await expect(fire(triggerId, created.body.secret)).resolves.toBe(401);
    await expect(fire(triggerId, rotated.body.secret)).resolves.toBe(202);
});

test('reads its own fire log and the stored payload of one fire', async () => {
    const created = await agentRequest(sageToken, 'POST', '/api/agent/triggers', {
        messageId: sageAnchorId,
        title: 'Logged',
    });
    const triggerId = created.body.trigger?.id ?? '';
    await fire(triggerId, created.body.secret, '{"build":"green"}');

    const log = await agentRequest(sageToken, 'GET', `/api/agent/triggers/${triggerId}/log`);
    const fireId = log.body.fires?.[0]?.id ?? '';
    const detail = await agentRequest(
        sageToken,
        'GET',
        `/api/agent/triggers/${triggerId}/log?fire=${fireId}`
    );

    expect(log.body.kind).toBe('fires');
    expect(log.body).not.toHaveProperty('fire');
    expect(log.body.fires).toHaveLength(1);
    expect(log.body.fires?.[0]).toMatchObject({ payloadBytes: 17, triggerId });
    expect(log.body.fires?.[0]).not.toHaveProperty('payload');
    expect(detail.body.kind).toBe('fire');
    expect(detail.body).not.toHaveProperty('fires');
    expect(detail.body.fire).toMatchObject({ id: fireId, payload: '{"build":"green"}' });
});

test('pages the fire log with limit and refuses a limit outside 1 to 100', async () => {
    const created = await agentRequest(sageToken, 'POST', '/api/agent/triggers', {
        messageId: sageAnchorId,
        title: 'Paged',
    });
    const triggerId = created.body.trigger?.id ?? '';
    for (const key of ['a', 'b', 'c']) {
        await fire(triggerId, created.body.secret, `{"key":"${key}"}`);
    }

    const paged = await agentRequest(
        sageToken,
        'GET',
        `/api/agent/triggers/${triggerId}/log?limit=2`
    );
    const refused = await agentRequest(
        sageToken,
        'GET',
        `/api/agent/triggers/${triggerId}/log?limit=101`
    );

    expect(paged.body.fires).toHaveLength(2);
    expect(refused.status).toBe(400);
});

test('disables a trigger whose owner is no longer an active Agent', async () => {
    const created = await agentRequest(doomedToken, 'POST', '/api/agent/triggers', {
        messageId: sageAnchorId,
        title: 'Owner leaves',
    });
    const triggerId = created.body.trigger?.id ?? '';
    await harness.sql`update agents set retired_at = now() where id = ${doomedAgentId}`;

    const response = await fetch(new URL(`/api/triggers/${triggerId}`, harness.url), {
        body: '{}',
        headers: { authorization: `Bearer ${created.body.secret}` },
        method: 'POST',
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: 'trigger_unavailable' });
    const [row] = (await harness.sql`
        select status from triggers where id = ${triggerId}
    `) as { status: string }[];
    expect(row.status).toBe('disabled');
});

test('shows an Agent-created trigger and arms or disables it from the App', async () => {
    const created = await agentRequest(sageToken, 'POST', '/api/agent/triggers', {
        messageId: sageAnchorId,
        title: 'Operator visible',
    });
    const triggerId = created.body.trigger?.id ?? '';
    await fire(triggerId, created.body.secret, 'ping');

    await expect(
        owner.trpc.trigger.list.query({ agentId: sageAgentId, serverId, status: 'armed' })
    ).resolves.toContainEqual(
        expect.objectContaining({
            createdByHandle: null,
            createdByUserId: null,
            id: triggerId,
            kind: 'webhook',
            ownerHandle: 'sage',
            status: 'armed',
            url: new URL(`/api/triggers/${triggerId}`, harness.url).toString(),
        })
    );
    await expect(admin.trpc.trigger.runs.query({ serverId, triggerId })).resolves.toEqual([
        expect.objectContaining({ payloadBytes: 4, triggerId }),
    ]);

    const disabled = await admin.trpc.trigger.setStatus.mutate({
        serverId,
        status: 'disabled',
        triggerId,
    });
    expect(disabled.trigger).toMatchObject({ id: triggerId, status: 'disabled' });
    expect(disabled.trigger).not.toHaveProperty('secret');
    await expect(fire(triggerId, created.body.secret)).resolves.toBe(409);

    // Setting the status it already has is a no-op, so the version does not churn.
    const again = await admin.trpc.trigger.setStatus.mutate({
        serverId,
        status: 'disabled',
        triggerId,
    });
    expect(again.trigger).toMatchObject({
        status: 'disabled',
        version: disabled.trigger.version,
    });
    const armed = await admin.trpc.trigger.setStatus.mutate({
        serverId,
        status: 'armed',
        triggerId,
    });
    expect(armed.trigger).toMatchObject({ disabledAt: null, status: 'armed' });
    await expect(fire(triggerId, created.body.secret)).resolves.toBe(202);
});

test('anchors a human-created trigger on the creator DM and writes no receipt', async () => {
    const created = await owner.trpc.trigger.create.mutate({
        agentId: sageAgentId,
        instruction: 'Summarize the payload here.',
        kind: 'webhook',
        serverId,
        title: 'App-created test',
    });

    expect(created.secret).toMatch(/^grtt_[\w-]{43}$/u);
    expect(created.url).toBe(
        new URL(`/api/triggers/${created.trigger.id}`, harness.url).toString()
    );
    expect(created.curl).toContain(`Authorization: Bearer ${created.secret}`);
    expect(created.trigger).toMatchObject({
        createdByHandle: 'trigger-owner',
        createdByUserId: ownerUserId,
        instruction: 'Summarize the payload here.',
        kind: 'webhook',
        ownerAgentId: sageAgentId,
        status: 'armed',
        url: created.url,
    });

    // A human has no asking message, so the anchor is the DM itself. Creating a
    // trigger writes nothing to the transcript.
    const [dm] = (await harness.sql`
        select c.id from chats c
        where c.server_id = ${serverId}
          and c.dm_agent_id = ${sageAgentId}
          and c.dm_member_one_user_id = ${ownerUserId}
    `) as { id: string }[];
    expect(created.trigger.anchorMessageId).toBeNull();
    expect(created.trigger.anchorChatId).toBe(dm.id);
    const dmMessages = (await harness.sql`
        select id from chat_messages where server_id = ${serverId} and chat_id = ${dm.id}
    `) as { id: string }[];
    expect(dmMessages).toEqual([]);

    // Fires wake the Agent in that DM and write no transcript row of their own.
    await expect(fire(created.trigger.id, created.secret, '{"ok":true}')).resolves.toBe(202);
    const [fired] = (await harness.sql`
        select work.chat_id, work.content from agent_inbox work
        join trigger_fires fire
          on fire.server_id = work.server_id and fire.id = work.dedupe_key
        where work.server_id = ${serverId} and fire.trigger_id = ${created.trigger.id}
    `) as { chat_id: string; content: string }[];
    expect(fired.chat_id).toBe(dm.id);
    expect(fired.content).toContain('⚡ Trigger: App-created test');
    const fireReceipts = (await harness.sql`
        select id from chat_messages
        where server_id = ${serverId} and content = ${'⚡ Trigger: App-created test'}
    `) as { id: string }[];
    expect(fireReceipts).toEqual([]);
});

test('edits the title and instruction, and refuses an empty edit', async () => {
    const created = await createOperatorTrigger('Editable', 'Original instruction.');

    const renamed = await admin.trpc.trigger.update.mutate({
        serverId,
        title: 'Renamed',
        triggerId: created.trigger.id,
    });
    const cleared = await admin.trpc.trigger.update.mutate({
        instruction: null,
        serverId,
        triggerId: created.trigger.id,
    });

    expect(renamed.trigger).toMatchObject({
        instruction: 'Original instruction.',
        title: 'Renamed',
        version: created.trigger.version + 1,
    });
    expect(cleared.trigger).toMatchObject({
        instruction: null,
        title: 'Renamed',
        version: created.trigger.version + 2,
    });
    await expect(
        // @ts-expect-error the input schema requires at least one editable field
        admin.trpc.trigger.update.mutate({ serverId, triggerId: created.trigger.id })
    ).rejects.toThrow();
});

test('rotating from the App retires the previous secret immediately', async () => {
    const created = await createOperatorTrigger('Operator rotatable');

    const rotated = await owner.trpc.trigger.rotate.mutate({
        serverId,
        triggerId: created.trigger.id,
    });

    expect(rotated.secret).toMatch(/^grtt_/u);
    expect(rotated.secret).not.toBe(created.secret);
    expect(rotated.curl).toContain(`Authorization: Bearer ${rotated.secret}`);
    await expect(fire(created.trigger.id, created.secret)).resolves.toBe(401);
    await expect(fire(created.trigger.id, rotated.secret)).resolves.toBe(202);
});

test('a test fire rides the same path a real delivery takes', async () => {
    const created = await createOperatorTrigger('Testable', 'Post the failing job.');

    const { fireId } = await admin.trpc.trigger.test.mutate({
        serverId,
        triggerId: created.trigger.id,
    });

    expect(fireId).toMatch(/^trf_/u);
    const [row] = (await harness.sql`
        select content_type, dedupe_key, payload from trigger_fires where id = ${fireId}
    `) as { content_type: string; dedupe_key: string | null; payload: string }[];
    expect(row).toMatchObject({ content_type: 'application/json', dedupe_key: null });
    expect(JSON.parse(row.payload)).toEqual({
        sentAt: expect.stringMatching(/^\d{4}-/u),
        sentBy: 'trigger-admin',
        test: true,
    });
    const receipts = (await harness.sql`
        select id from chat_messages where nonce = ${`trigger:fire:${fireId}`}
    `) as { id: string }[];
    expect(receipts).toEqual([]);
    const [pending] = (await harness.sql`
        select agent_id, content, source, state from agent_inbox
        where dedupe_key = ${fireId}
    `) as { agent_id: string; content: string; source: string; state: string }[];
    expect(pending).toMatchObject({ agent_id: sageAgentId, source: 'trigger', state: 'queued' });
    expect(pending.content).toContain('⚡ Trigger: Testable');
    expect(pending.content).toContain('Instruction: Post the failing job.');
    expect(pending.content).toContain('"test":true');
    expect(pending.content.split('\n').at(-1)).toBe(
        `reply with: --cause ${fireId} on the command that posts (haus message send or haus cloud-agent start)`
    );
    await expect(
        admin.trpc.trigger.runs.query({ serverId, triggerId: created.trigger.id })
    ).resolves.toContainEqual(expect.objectContaining({ id: fireId }));
});

test('a test fire refuses a disabled trigger and spends the same rate budget', async () => {
    const disabledTrigger = await createOperatorTrigger('Disabled for testing');
    await owner.trpc.trigger.setStatus.mutate({
        serverId,
        status: 'disabled',
        triggerId: disabledTrigger.trigger.id,
    });
    await expect(
        owner.trpc.trigger.test.mutate({ serverId, triggerId: disabledTrigger.trigger.id })
    ).rejects.toThrow(/disabled/i);
    const noFires = (await harness.sql`
        select id from trigger_fires where trigger_id = ${disabledTrigger.trigger.id}
    `) as { id: string }[];
    expect(noFires).toHaveLength(0);

    const noisy = await createOperatorTrigger('Noisy for testing');
    for (let index = 0; index < triggerBurstLimit; index += 1) {
        await expect(fire(noisy.trigger.id, noisy.secret, String(index))).resolves.toBe(202);
    }

    await expect(
        owner.trpc.trigger.test.mutate({ serverId, triggerId: noisy.trigger.id })
    ).rejects.toThrow(/rate limit/i);
});

test('keeps every operator Trigger procedure to Owners and Admins', async () => {
    const created = await createOperatorTrigger('Members may not touch this');
    const triggerId = created.trigger.id;

    for (const call of [
        () => member.trpc.trigger.list.query({ serverId }),
        () => member.trpc.trigger.history.query({ agentId: sageAgentId, serverId }),
        () => member.trpc.trigger.runs.query({ serverId, triggerId }),
        () =>
            member.trpc.trigger.create.mutate({
                agentId: sageAgentId,
                kind: 'webhook',
                serverId,
                title: 'Not allowed',
            }),
        () => member.trpc.trigger.update.mutate({ serverId, title: 'Not allowed', triggerId }),
        () => member.trpc.trigger.setStatus.mutate({ serverId, status: 'disabled', triggerId }),
        () => member.trpc.trigger.rotate.mutate({ serverId, triggerId }),
        () => member.trpc.trigger.test.mutate({ serverId, triggerId }),
        () => member.trpc.trigger.delete.mutate({ serverId, triggerId }),
    ]) {
        await expect(call()).rejects.toThrow(/Owner or Admin/i);
    }
    await expect(outsider.trpc.trigger.list.query({ serverId })).rejects.toThrow(/member/i);
    await expect(outsider.trpc.trigger.test.mutate({ serverId, triggerId })).rejects.toThrow(
        /member/i
    );
    const [survivor] = (await harness.sql`
        select status from triggers where id = ${triggerId}
    `) as { status: string }[];
    expect(survivor.status).toBe('armed');
});

test('refuses a kind Haus does not have, on both authoring paths', async () => {
    await expect(
        owner.trpc.trigger.create.mutate({
            agentId: sageAgentId,
            // @ts-expect-error the wire enum has exactly one member today
            kind: 'schedule',
            serverId,
            title: 'Unknown kind',
        })
    ).rejects.toThrow();
    const refused = await agentRequest(sageToken, 'POST', '/api/agent/triggers', {
        kind: 'schedule',
        messageId: sageAnchorId,
        title: 'Unknown kind',
    });
    expect(refused).toMatchObject({ body: { code: 'INVALID_ARG' }, status: 400 });
});

/** One trigger created the way a human does, anchored on its own DM receipt. */
async function createOperatorTrigger(title: string, instruction?: string) {
    return await owner.trpc.trigger.create.mutate({
        agentId: sageAgentId,
        ...(instruction ? { instruction } : {}),
        kind: 'webhook',
        serverId,
        title,
    });
}

async function fire(triggerId: string, secret: string | undefined, payload = '') {
    const response = await fetch(new URL(`/api/triggers/${triggerId}`, harness.url), {
        body: payload,
        headers: secret ? { authorization: `Bearer ${secret}` } : {},
        method: 'POST',
    });
    return response.status;
}

async function agentRequest(
    token: string,
    method: 'DELETE' | 'GET' | 'POST',
    path: string,
    body?: unknown
) {
    const response = await fetch(new URL(path, harness.url), {
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        headers: {
            authorization: `Bearer ${token}`,
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        method,
    });
    return {
        body: (await response.json()) as {
            code?: string;
            fire?: Record<string, unknown>;
            fires?: Array<Record<string, unknown> & { id?: string }>;
            kind?: string;
            secret?: string;
            trigger?: Record<string, unknown> & { id?: string };
            triggers?: Record<string, unknown>[];
        },
        status: response.status,
    };
}

async function createAgent(displayName: string, handle: string) {
    const created = await owner.trpc.agent.create.mutate({
        computerId,
        displayName,
        handle,
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId,
    });
    return created.agent.id;
}

async function sendAnchor(content: string, nonce: string) {
    const sent = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content,
        nonce,
        serverId,
    });
    return sent.message.id;
}

async function mintRunner(agentId: string, runId: string) {
    const response = await fetch(new URL('/computer/runner/mint', harness.url), {
        body: JSON.stringify({ agentId, chatId: channelId, credentialHash, runId }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    if (!response.ok) {
        throw new Error(`mint failed: ${response.status}`);
    }
    return ((await response.json()) as { runnerToken: string }).runnerToken;
}

async function addHuman(clerkUserId: string, role: 'admin' | 'member') {
    const client = await signIn(clerkUserId);
    await client.trpc.server.create.mutate({
        displayName: `${clerkUserId} Root`,
        slug: `${clerkUserId.replaceAll('_', '-')}-root`,
    });
    await harness.sql`
        insert into server_memberships (id, server_id, user_id, role, handle)
        values (
            ${`mem_${clerkUserId}`}, ${serverId}, ${await readUserId(clerkUserId)}, ${role},
            ${`trigger-${role}`}
        )
    `;
    return client;
}

async function readUserId(clerkUserId: string) {
    const [user] = (await harness.sql`
        select id from users where clerk_user_id = ${clerkUserId}
    `) as { id: string }[];
    return user.id;
}

async function signIn(clerkUserId: string) {
    return createHausClient(harness, await harness.clerk.mintSessionToken(clerkUserId));
}
