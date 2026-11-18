import { afterAll, beforeAll, expect, test } from 'bun:test';
import type {
    AvatarGenerationLogEvent,
    AvatarImageProvider,
    AvatarProviderRequest,
} from '../src/avatar-generation/service.ts';
import { AvatarGenerationUnavailableError } from '../src/avatar-generation/service.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let owner: HausClient;
let agentId: string;
let chatId: string;
let serverId: string;
let providerMode: 'fail' | 'success' | 'unavailable' = 'success';
const requests: AvatarProviderRequest[] = [];
const logs: AvatarGenerationLogEvent[] = [];

const credentialHash = 'a'.repeat(64);
const computerId = `cmp_${'v'.repeat(16)}`;
const png = Uint8Array.from(
    Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
    )
);

const provider: AvatarImageProvider = {
    generate: async (request) => {
        requests.push(request);
        if (providerMode === 'fail') {
            throw new Error('provider detail must not cross the API');
        }
        if (providerMode === 'unavailable') {
            throw new AvatarGenerationUnavailableError();
        }
        return { bytes: png, mediaType: 'image/png' };
    },
};

beforeAll(async () => {
    harness = await startHausServerHarness({
        avatarGenerationLogger: (event) => logs.push(event),
        avatarImageProvider: provider,
    });
    owner = await signIn('user_avatar_api_owner');
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Avatar API HQ',
        slug: 'avatar-api-hq',
    });
    serverId = server.id;
    const ownerUserId = await readUserId('user_avatar_api_owner');
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
    const created = await owner.trpc.agent.create.mutate({
        computerId,
        displayName: 'Avatar Agent',
        handle: 'avatar-agent',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId,
    });
    agentId = created.agent.id;
    chatId = (await owner.trpc.chat.ensureAgentDm.mutate({ agentId, serverId })).id;
});

afterAll(async () => {
    owner.close();
    await harness.close();
});

test('requires a managed runner and validates the concept before calling the provider', async () => {
    const missingToken = await fetch(new URL('/api/agent/agents/avatar', harness.url), {
        body: JSON.stringify({ agent: '@avatar-agent', concept: 'a fox' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    expect(missingToken.status).toBe(401);

    const runner = await mintRunner('avatar_invalid');
    const invalid = await generate(runner.runnerToken, { concept: '   ' });
    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({ code: 'INVALID_ARG' });
    expect(requests).toHaveLength(0);
});

test('sets one normalized avatar and keeps operational logging redacted', async () => {
    const runner = await mintRunner('avatar_success');
    const concept = 'a moonlit raccoon cartographer';
    const response = await generate(runner.runnerToken, { concept });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
        agent: { agentId, handle: 'avatar-agent', retired: false },
        avatar: { height: 256, mediaType: 'image/png', width: 256 },
    });
    expect(response.body.agent.avatarUrl).not.toBeNull();
    const [row] = (await harness.sql`
        select avatar_id from agents where id = ${agentId}
    `) as { avatar_id: string | null }[];
    expect(row?.avatar_id).not.toBeNull();
    expect(requests).toHaveLength(1);
    expect(requests[0]).not.toHaveProperty('referenceImage');
    expect(logs.at(-1)).toMatchObject({
        actorAgentId: agentId,
        outcome: 'success',
        serverId,
    });
    expect(JSON.stringify(logs)).not.toContain(concept);
});

test('maps provider failure to a safe retryable API error', async () => {
    providerMode = 'fail';
    const runner = await mintRunner('avatar_failure');
    const response = await generate(runner.runnerToken, { concept: 'a storm lantern' });

    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({
        code: 'AVATAR_PROVIDER_FAILED',
        retryable: true,
    });
    expect(response.body.message).not.toContain('provider detail');
    providerMode = 'success';
});

test('does not invent an App setting when the Server provider is unavailable', async () => {
    providerMode = 'unavailable';
    const runner = await mintRunner('avatar_unavailable');
    const response = await generate(runner.runnerToken, { concept: 'a copper owl' });

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ code: 'AVATAR_PROVIDER_UNAVAILABLE' });
    expect(response.body.retryable).toBeUndefined();
    expect(response.body.nextAction).toContain('there is no App setting to change');
    expect(response.body.nextAction).not.toMatch(/configure.*model/iu);
    providerMode = 'success';
});

async function mintRunner(runId: string) {
    const response = await fetch(new URL('/computer/runner/mint', harness.url), {
        body: JSON.stringify({ agentId, chatId, credentialHash, runId }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    expect(response.status).toBe(200);
    return (await response.json()) as { runnerToken: string };
}

async function generate(token: string, body: { concept: string }) {
    const response = await fetch(new URL('/api/agent/agents/avatar', harness.url), {
        body: JSON.stringify({ agent: '@avatar-agent', ...body }),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    return {
        body: (await response.json()) as Record<string, any>,
        status: response.status,
    };
}

async function signIn(subject: string) {
    return createHausClient(harness, await harness.humans.mintSessionToken(subject));
}

async function readUserId(subject: string) {
    const rows = (await harness.sql`
        select id from users where auth_subject = ${subject}
    `) as { id: string }[];
    return rows[0]?.id ?? '';
}
