// Throwaway: real Haus HTTP/WebSocket delivery against a disposable database.
import { createHash, randomBytes } from 'node:crypto';
import { cloudAgentComputerFixture } from '../../cloud-agent-computer-fixture.ts';
import { createHausClient } from '../../haus-client.ts';
import { startHausServerHarness } from '../../haus-server-harness.ts';

export async function startFixture() {
    const harness = await startHausServerHarness();
    const owner = createHausClient(
        harness,
        await harness.clerk.mintSessionToken('user_cloud_input_prototype')
    );
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Cloud input prototype',
        slug: 'cloud-input-prototype',
    });
    const [user] =
        await harness.sql`select id from users where clerk_user_id = 'user_cloud_input_prototype'`;
    await owner.trpc.member.updateProfile.mutate({
        description: null,
        displayName: 'Prototype Operator',
        handle: 'prototype-operator',
        serverId: server.id,
    });
    const credential = randomBytes(32).toString('base64url');
    const credentialHash = createHash('sha256').update(credential).digest('hex');
    const computerId = `cmp_${randomBytes(12).toString('base64url')}`;
    await harness.sql`insert into computers (id,server_id,attached_by_user_id,credential_hash,reported_inventory,health)
        values (${computerId},${server.id},${user.id},${credentialHash},${{ runtimes: [{ id: 'claude-code', label: 'Claude Code', models: [{ id: 'claude-sonnet-4-6', label: 'Sonnet' }] }] }}::jsonb,'healthy')`;
    const { agent } = await owner.trpc.agent.create.mutate({
        computerId,
        displayName: 'Cloud Liaison',
        handle: 'cloud-liaison',
        modelId: 'claude-sonnet-4-6',
        runtimeId: 'claude-code',
        serverId: server.id,
    });
    const trigger = await owner.trpc.trigger.create.mutate({
        agentId: agent.id,
        instruction:
            'Answer the cloud question from the task context, or ask the human here. Relay the answer to its input request.',
        kind: 'webhook',
        serverId: server.id,
        title: 'Claude pending input',
    });
    if (!('secret' in trigger)) {
        throw new Error('Expected a new webhook Trigger');
    }
    const triggerSecret = trigger.secret;
    let socket: WebSocket | null = null;
    const frames: Record<string, unknown>[] = [];
    async function attach() {
        socket = await cloudAgentComputerFixture(
            () => harness.url.toString(),
            credential
        ).attachComputer();
        socket.addEventListener('message', (event) => {
            const frame = JSON.parse(String(event.data));
            frames.push(frame);
            if (frame.type === 'start') {
                socket?.send(
                    JSON.stringify({ type: 'ack', agentId: agent.id, runId: frame.runId })
                );
            }
        });
        return socket;
    }
    async function notify(id: string, payload: unknown) {
        const response = await fetch(new URL(`/api/triggers/${trigger.trigger.id}`, harness.url), {
            method: 'POST',
            headers: {
                authorization: `Bearer ${triggerSecret}`,
                'content-type': 'application/json',
                'idempotency-key': id,
            },
            body: JSON.stringify(payload),
        });
        if (response.status !== 202 && response.status !== 200) {
            throw new Error(`Inbox delivery failed: ${response.status}`);
        }
        return await response.json();
    }
    async function mint(runId: string) {
        const response = await fetch(new URL('/computer/runner/mint', harness.url), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                agentId: agent.id,
                chatId: trigger.trigger.anchorChatId,
                credentialHash,
                runId,
            }),
        });
        if (!response.ok) {
            throw new Error(`Runner mint failed: ${response.status}`);
        }
        return ((await response.json()) as { runnerToken: string }).runnerToken;
    }
    async function authorize(token: string) {
        const hash = createHash('sha256').update(token).digest('hex');
        const [row] =
            await harness.sql`select agent_id from agent_runner_credentials where token_hash=${hash} and revoked_at is null and expires_at > now() and agent_id=${agent.id} and server_id=${server.id}`;
        return Boolean(row);
    }
    return {
        agentId: agent.id,
        attach,
        authorize,
        frames,
        harness,
        mint,
        notify,
        serverId: server.id,
        async close() {
            socket?.close();
            owner.close();
            await harness.close();
        },
    };
}
export type Fixture = Awaited<ReturnType<typeof startFixture>>;
