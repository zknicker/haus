import { afterAll, beforeAll, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import type { Worker } from '@haus/api';
import { createHomedAgent } from './agent-home.fixture.ts';
import { readTargetAsAgent } from './agent-read-target.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { createTestProject } from './project.fixture.ts';
import { startTestTask, type TestTask } from './task-place-fixture.ts';
import { workerComputerFixture } from './worker-computer-fixture.ts';
import { workerFixtureReads } from './worker-fixture-reads.ts';

export function workerRecordFixture() {
    let harness: HausServerHarness;
    let owner: HausClient;
    let peer: HausClient;
    let outsider: HausClient;

    let serverId: string;
    let channelId: string;
    let orbitAgentId: string;
    let ownerUserId: string;
    let peerUserId: string;
    let task: TestTask;

    const computerId = `cmp_${'c'.repeat(16)}`;
    const credential = `worker-computer-credential-${'x'.repeat(16)}`;
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
            ${{
                cloudAgentProviders: [
                    { models: null, provider: 'cursor', ready: true, reason: null },
                    { models: null, provider: 'claude', ready: true, reason: null },
                ],
                runtimes: [
                    { id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] },
                ],
            }}::jsonb,
            'healthy'
        )
    `;
        orbitAgentId = (
            await createHomedAgent(owner, {
                computerId,
                displayName: 'Orbit',
                handle: 'orbit',
                modelId: 'gpt-5.6-sol',
                runtimeId: 'codex',
                serverId,
            })
        ).agent.id;
        channelId = (
            await createTestProject(owner, {
                agentIds: [orbitAgentId],
                name: 'product',
                serverId,
            })
        ).id;
        await harness.sql`
        insert into channel_participants (server_id, chat_id, user_id)
        values (${serverId}, ${channelId}, ${peerUserId})
    `;
        task = await startTestTask(harness, owner, {
            channelId,
            serverId,
            title: 'Fix the flaky delivery test',
        });
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
        get task() {
            return task;
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
        ...workerFixtureReads(
            () => harness,
            () => serverId
        ),
        ...workerComputerFixture(() => harness.url, credential),
        join,
        signIn,
        readUserId,
    };

    function startBody(overrides: Record<string, string | undefined> = {}) {
        return {
            brief: 'Make the flaky delivery test deterministic.',
            nonce: 'cloud-default',
            place: 'cursor',
            repository: 'haus/haus',
            startingRef: 'main',
            task: task.shortId,
            title: 'Fix the flaky delivery test',
            ...overrides,
        };
    }

    async function postStart(
        runner: { token: string } | null,
        body: Record<string, string | undefined>
    ) {
        await harness.sql`update computers set health = 'healthy' where id = ${computerId}`;
        const response = await fetch(new URL('/api/agent/workers', harness.url), {
            body: JSON.stringify(body),
            headers: {
                ...(runner ? { authorization: `Bearer ${runner.token}` } : {}),
                'content-type': 'application/json',
            },
            method: 'POST',
        });
        const parsed = (await response.json()) as {
            code?: string;
            message?: string;
            state?: string;
            worker?: Worker;
        };
        return {
            body: parsed,
            status: response.status,
            turnId: parsed.worker?.turns.at(-1)?.turnId,
        };
    }

    async function postCancel(runner: { token: string }, workerId: string) {
        const response = await fetch(new URL('/api/agent/workers/stop', harness.url), {
            body: JSON.stringify({ workerId }),
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

    async function signIn(subject: string, verifiedEmails: string[]) {
        harness.humans.setVerifiedEmails(subject, verifiedEmails);
        return createHausClient(harness, await harness.humans.mintSessionToken(subject));
    }

    async function readUserId(subject: string) {
        const [row] = (await harness.sql`
        select id from users where auth_subject = ${subject}
    `) as { id: string }[];
        return row?.id ?? '';
    }
}
