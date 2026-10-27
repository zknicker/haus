import { afterAll, beforeAll, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import type { CloudAgentBranch, CloudAgentWork } from '@haus/api';
import { readTargetAsAgent } from './agent-read-target.ts';
import { cloudAgentComputerFixture } from './cloud-agent-computer-fixture.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

export function cloudAgentFixture() {
    let harness: HausServerHarness;
    let owner: HausClient;
    let peer: HausClient;
    let outsider: HausClient;

    let serverId: string;
    let channelId: string;
    let orbitAgentId: string;
    let ownerUserId: string;
    let peerUserId: string;

    const computerId = `cmp_${'c'.repeat(16)}`;
    const credential = `cloud-agent-computer-credential-${'x'.repeat(16)}`;
    const credentialHash = createHash('sha256').update(credential).digest('hex');

    beforeAll(async () => {
        harness = await startHausServerHarness();
        owner = await signIn('user_cloud_owner', ['ada@haus.test']);
        peer = await signIn('user_cloud_peer', ['bo@haus.test']);
        outsider = await signIn('user_cloud_outsider', ['cass@haus.test']);

        const server = await owner.trpc.server.create.mutate({
            displayName: 'Cloud HQ',
            slug: 'cloud-hq',
        });
        serverId = server.id;
        await owner.trpc.member.updateProfile.mutate({
            description: null,
            displayName: 'Ada',
            handle: 'ada',
            serverId,
        });
        await join(peer, 'bo@haus.test', 'Bo', 'bo');
        await join(outsider, 'cass@haus.test', 'Cass', 'cass');
        ownerUserId = await readUserId('user_cloud_owner');
        peerUserId = await readUserId('user_cloud_peer');

        await harness.sql`
        insert into computers (
            id, server_id, attached_by_user_id, credential_hash, reported_inventory, health
        )
        values (
            ${computerId}, ${serverId}, ${ownerUserId}, ${credentialHash},
            ${{ runtimes: [{ id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] }] }}::jsonb,
            'healthy'
        )
    `;
        orbitAgentId = (
            await owner.trpc.agent.create.mutate({
                computerId,
                displayName: 'Orbit',
                handle: 'orbit',
                modelId: 'gpt-5.6-sol',
                runtimeId: 'codex',
                serverId,
            })
        ).agent.id;
        channelId = (
            await owner.trpc.chat.createChannel.mutate({
                agentIds: [orbitAgentId],
                name: 'product',
                serverId,
            })
        ).id;
        await harness.sql`
        insert into channel_participants (server_id, chat_id, user_id)
        values (${serverId}, ${channelId}, ${peerUserId})
    `;
    });

    afterAll(async () => {
        owner.close();
        peer.close();
        outsider.close();
        await harness?.close();
    });

    return {
        get harness() {
            return harness;
        },
        get owner() {
            return owner;
        },
        get peer() {
            return peer;
        },
        get outsider() {
            return outsider;
        },
        get serverId() {
            return serverId;
        },
        get channelId() {
            return channelId;
        },
        get orbitAgentId() {
            return orbitAgentId;
        },
        get ownerUserId() {
            return ownerUserId;
        },
        get peerUserId() {
            return peerUserId;
        },
        get computerId() {
            return computerId;
        },
        get credential() {
            return credential;
        },
        get credentialHash() {
            return credentialHash;
        },
        startBody,
        postStart,
        readTarget: (runner: { runId: string; token: string }, target: string) =>
            readTargetAsAgent(harness, { agentId: orbitAgentId, serverId }, runner, target),
        postCancel,
        mintRunner,
        readWork,
        readRun,
        readBranches,
        readAttentions,
        countWork,
        waitForWorkStatus,
        waitFor,
        ...cloudAgentComputerFixture(() => harness.url, credential),
        join,
        signIn,
        readUserId,
    };

    function startBody(overrides: Record<string, string> = {}) {
        return {
            content: 'Handing the flaky delivery test to a cloud agent.',
            nonce: 'cloud-default',
            provider: 'cursor',
            repository: 'haus/haus',
            startingRef: 'main',
            target: '#product',
            title: 'Fix the flaky delivery test',
            ...overrides,
        };
    }

    async function postStart(runner: { token: string } | null, body: Record<string, string>) {
        const response = await fetch(new URL('/api/agent/cloud-agents', harness.url), {
            body: JSON.stringify(body),
            headers: {
                ...(runner ? { authorization: `Bearer ${runner.token}` } : {}),
                'content-type': 'application/json',
            },
            method: 'POST',
        });
        return {
            body: (await response.json()) as {
                chatId?: string;
                code?: string;
                idempotent?: boolean;
                messageId?: string;
                runId?: string;
                target?: string;
                work?: CloudAgentWork;
            },
            status: response.status,
        };
    }

    async function postCancel(runner: { token: string }, workId: string) {
        const response = await fetch(new URL('/api/agent/cloud-agents/cancel', harness.url), {
            body: JSON.stringify({ workId }),
            headers: {
                authorization: `Bearer ${runner.token}`,
                'content-type': 'application/json',
            },
            method: 'POST',
        });
        return { body: await response.json(), status: response.status };
    }

    async function mintRunner(runId: string) {
        const response = await fetch(new URL('/computer/runner/mint', harness.url), {
            body: JSON.stringify({
                agentId: orbitAgentId,
                chatId: channelId,
                credentialHash,
                runId,
            }),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
        });
        expect(response.status).toBe(200);
        const { runnerToken } = (await response.json()) as { runnerToken: string };
        return { runId, token: runnerToken };
    }

    async function readWork(workId: string) {
        const [row] = (await harness.sql`
        select activity_summary, cancel_requested_by_agent_id, cancel_requested_by_user_id,
               provider_agent_id, provider_url, started_at, status, terminal_at
        from cloud_agent_work where id = ${workId}
    `) as Record<string, unknown>[];
        return row;
    }

    async function readRun(runId: string) {
        const [row] = (await harness.sql`
        select branches, raw_status, started_at, status, summary, terminal_at
        from cloud_agent_runs where id = ${runId}
    `) as Record<string, unknown>[];
        return row;
    }

    async function readBranches(runId: string): Promise<CloudAgentBranch[]> {
        return ((await readRun(runId))?.branches as CloudAgentBranch[] | undefined) ?? [];
    }

    async function readAttentions(runId: string) {
        return (await harness.sql`
        select id from agent_inbox
        where server_id = ${serverId} and source = 'cloud_agent_work' and dedupe_key = ${runId}
    `) as { id: string }[];
    }

    async function countWork() {
        const [row] = (await harness.sql`
        select count(*)::int as total from cloud_agent_work where server_id = ${serverId}
    `) as { total: number }[];
        return row.total;
    }

    async function waitForWorkStatus(workId: string, status: string) {
        await waitFor(async () => {
            const row = await readWork(workId);
            return row?.status === status ? row : null;
        });
    }

    async function waitFor<T>(read: () => Promise<T | null | undefined> | T | null | undefined) {
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
            const value = await read();
            if (value) {
                return value;
            }
            await Bun.sleep(20);
        }
        throw new Error('Timed out waiting for the expected Cloud Agent state.');
    }

    async function join(client: HausClient, email: string, displayName: string, handle: string) {
        const { token } = await owner.trpc.invitation.create.mutate({ email, serverId });
        await client.trpc.invitation.accept.mutate({ token });
        await client.trpc.member.updateProfile.mutate({
            description: null,
            displayName,
            handle,
            serverId,
        });
    }

    async function signIn(clerkUserId: string, verifiedEmails: string[]) {
        harness.clerkUsers.setVerifiedEmails(clerkUserId, verifiedEmails);
        return createHausClient(harness, await harness.clerk.mintSessionToken(clerkUserId));
    }

    async function readUserId(clerkUserId: string) {
        const [row] = (await harness.sql`
        select id from users where clerk_user_id = ${clerkUserId}
    `) as { id: string }[];
        return row?.id ?? '';
    }
}
