import { afterAll, beforeAll, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import {
    type AgentCreateAgentReceipt,
    type CreatedAgentSummary,
    suggestParticipantHandle,
} from '@haus/api';
import type {
    AvatarImageProvider,
    AvatarProviderRequest,
} from '../src/avatar-generation/service.ts';
import { AvatarGenerationUnavailableError } from '../src/avatar-generation/service.ts';
import type { MessageRouter } from '../src/message-routing/jev.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

/** One-pixel PNG: deterministic bytes, so no test ever reaches a real provider. */
const deterministicPng = Uint8Array.from(
    Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
    )
);

export type AvatarProviderMode = 'fail' | 'success' | 'unavailable';

export function agentCreationFixture(messageRouter?: MessageRouter) {
    let harness: HausServerHarness;
    let owner: HausClient;
    let outsider: HausClient;
    let serverId: string;
    let otherServerId: string;
    let channelId: string;
    let orbitAgentId: string;
    let peerAgentId: string;
    let coveAgentId: string;
    let ownerUserId: string;

    let avatarMode: AvatarProviderMode = 'success';
    const avatarRequests: AvatarProviderRequest[] = [];

    const computerId = `cmp_${'a'.repeat(16)}`;
    const credential = `agent-creation-credential-${'x'.repeat(16)}`;
    const credentialHash = createHash('sha256').update(credential).digest('hex');

    const avatarImageProvider: AvatarImageProvider = {
        get available() {
            return avatarMode !== 'unavailable';
        },
        generate: async (request) => {
            avatarRequests.push(request);
            if (avatarMode === 'unavailable') {
                throw new AvatarGenerationUnavailableError();
            }
            if (avatarMode === 'fail') {
                throw new Error('provider detail must not cross the API');
            }
            return { bytes: deterministicPng, mediaType: 'image/png' as const };
        },
    };

    beforeAll(async () => {
        harness = await startHausServerHarness({ avatarImageProvider, messageRouter });
        owner = await signIn('user_agent_creation_owner', ['ada@haus.test']);
        outsider = await signIn('user_agent_creation_outsider', ['cass@haus.test']);

        const server = await owner.trpc.server.create.mutate({
            displayName: 'Creation HQ',
            slug: 'agent-creation-hq',
        });
        serverId = server.id;
        await owner.trpc.member.updateProfile.mutate({
            description: null,
            displayName: 'Ada',
            handle: 'ada',
            serverId,
        });
        ownerUserId = await readUserId('user_agent_creation_owner');

        otherServerId = (
            await outsider.trpc.server.create.mutate({
                displayName: 'Other HQ',
                slug: 'agent-creation-other-hq',
            })
        ).id;

        await seedComputer(serverId, computerId, ownerUserId, credentialHash);
        orbitAgentId = await createAgent('Orbit', 'orbit');
        peerAgentId = await createAgent('Peer', 'peer');
        coveAgentId = await seedCove();
        channelId = (
            await owner.trpc.chat.createChannel.mutate({
                agentIds: [orbitAgentId],
                name: 'product',
                serverId,
            })
        ).id;
    });

    afterAll(async () => {
        owner.close();
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
        get outsider() {
            return outsider;
        },
        get serverId() {
            return serverId;
        },
        get otherServerId() {
            return otherServerId;
        },
        get channelId() {
            return channelId;
        },
        get orbitAgentId() {
            return orbitAgentId;
        },
        get peerAgentId() {
            return peerAgentId;
        },
        get coveAgentId() {
            return coveAgentId;
        },
        get computerId() {
            return computerId;
        },
        get ownerUserId() {
            return ownerUserId;
        },
        get avatarRequests() {
            return avatarRequests;
        },
        setAvatarMode(mode: AvatarProviderMode) {
            avatarMode = mode;
        },
        createAgent,
        createBody,
        mintRunner,
        post,
        postCreate,
        readAgentRow,
        seedOffsiteAgent,
        signIn,
        readUserId,
    };

    /**
     * The announcement names the new Agent, because the Server requires it, and
     * derives the handle exactly as a creating Agent would predict it.
     */
    function createBody(overrides: Record<string, unknown> = {}) {
        const displayName = (overrides.displayName as string | undefined) ?? 'Scout';
        return {
            content: `Bringing on @${suggestParticipantHandle(displayName)} for the delivery lane.`,
            description: 'Watches the delivery lane.',
            displayName,
            nonce: 'agent-create-default',
            target: '#product',
            ...overrides,
        };
    }

    async function mintRunner(runId: string, agentId = orbitAgentId, chatId = channelId) {
        const response = await fetch(new URL('/computer/runner/mint', harness.url), {
            body: JSON.stringify({ agentId, chatId, credentialHash, runId }),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
        });
        expect(response.status).toBe(200);
        const { runnerToken } = (await response.json()) as { runnerToken: string };
        return { runId, token: runnerToken };
    }

    async function post(path: string, runner: { token: string } | null, body: unknown) {
        const response = await fetch(new URL(path, harness.url), {
            body: JSON.stringify(body),
            headers: {
                ...(runner ? { authorization: `Bearer ${runner.token}` } : {}),
                'content-type': 'application/json',
            },
            method: 'POST',
        });
        return {
            body: (await response.json()) as Partial<AgentCreateAgentReceipt> & {
                agent?: CreatedAgentSummary;
                code?: string;
                handle?: string;
                nextAction?: string;
                retryable?: boolean;
            },
            status: response.status,
        };
    }

    async function postCreate(runner: { token: string } | null, body: unknown) {
        return await post('/api/agent/agents', runner, body);
    }

    async function readAgentRow(agentId: string) {
        const [row] = (await harness.sql`
            select created_by_agent_id, created_by_user_id, creation_message_id, avatar_id,
                   description, desired_model_id, desired_reasoning_effort, desired_runtime_id,
                   computer_id, handle, retired_at
            from agents where id = ${agentId}
        `) as Record<string, unknown>[];
        return row;
    }

    /** An Agent on a Server this fixture's runner has no authority over. */
    async function seedOffsiteAgent(handle: string) {
        const offsiteComputerId = `cmp_${'b'.repeat(16)}`;
        const outsiderUserId = await readUserId('user_agent_creation_outsider');
        await seedComputer(
            otherServerId,
            offsiteComputerId,
            outsiderUserId,
            createHash('sha256').update(offsiteComputerId).digest('hex')
        );
        const agentId = `agt_${'f'.repeat(16)}`;
        await harness.sql`
            insert into agents (
                id, server_id, computer_id, display_name, handle, home_timezone,
                desired_model_id, desired_runtime_id
            )
            values (
                ${agentId}, ${otherServerId}, ${offsiteComputerId}, 'Offsite', ${handle}, 'UTC',
                'gpt-5.6-sol', 'codex'
            )
        `;
        return agentId;
    }

    async function seedComputer(
        targetServerId: string,
        id: string,
        attachedByUserId: string,
        hash: string
    ) {
        await harness.sql`
            insert into computers (
                id, server_id, attached_by_user_id, credential_hash, reported_inventory, health
            )
            values (
                ${id}, ${targetServerId}, ${attachedByUserId}, ${hash},
                ${{ runtimes: [{ id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] }] }}::jsonb,
                'healthy'
            )
        `;
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

    /** Cove is product-owned, so it is seeded rather than created through the API. */
    async function seedCove() {
        const agentId = `agt_${'c'.repeat(16)}`;
        await harness.sql`
            insert into agents (
                id, server_id, computer_id, display_name, handle, home_timezone,
                desired_model_id, desired_runtime_id, factory_kind, description
            )
            values (
                ${agentId}, ${serverId}, ${computerId}, 'Cove', 'cove', 'UTC',
                'gpt-5.6-sol', 'codex', 'cove', 'Onboarding Assistant'
            )
        `;
        return agentId;
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
