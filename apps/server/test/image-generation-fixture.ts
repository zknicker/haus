import { afterAll, beforeAll, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import type { ImageGeneration } from '@haus/api';
import { ImageProviderError } from '../src/image-generation/providers/image-provider.ts';
import type { ImageProviderAdapters } from '../src/image-generation/run-image-generation.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

const computerId = `cmp_${'i'.repeat(16)}`;
const credential = `image-generation-computer-credential-${'x'.repeat(16)}`;
const credentialHash = createHash('sha256').update(credential).digest('hex');

/** A PNG header carrying only the claimed size. */
export const fakePng = (() => {
    const bytes = new Uint8Array(33);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    const view = new DataView(bytes.buffer);
    view.setUint32(8, 13);
    bytes.set([0x49, 0x48, 0x44, 0x52], 12);
    view.setUint32(16, 1024);
    view.setUint32(20, 1024);
    return bytes;
})();

/**
 * A Server with an Owner, a peer, the Agent Orbit on a Computer, and a shared
 * `#art` Channel, over fake image providers. `behavior.mode` flips the fakes
 * between rendering and failing; `providerCalls` records `provider:key:prompt`.
 */
export function imageGenerationFixture() {
    let harness: HausServerHarness;
    let owner: HausClient;
    let peer: HausClient;
    let serverId: string;
    let orbitAgentId: string;
    let channelId: string;
    const behavior = { mode: 'ok' as 'fail' | 'ok' };
    const providerCalls: string[] = [];

    const fakeAdapter = (provider: string) => ({
        generate: (request: { prompt: string }, apiKey: string) => {
            providerCalls.push(`${provider}:${apiKey}:${request.prompt}`);
            if (behavior.mode === 'fail') {
                return Promise.reject(
                    new ImageProviderError(
                        'rate-limit',
                        'The image provider rate limit was reached.'
                    )
                );
            }
            return Promise.resolve({
                bytes: fakePng,
                height: 1024,
                mediaType: 'image/png',
                usage:
                    provider === 'openai'
                        ? { imageInputTokens: 0, outputTokens: 1000, textInputTokens: 100 }
                        : null,
                width: 1024,
            });
        },
    });
    const adapters: ImageProviderAdapters = {
        gemini: fakeAdapter('gemini'),
        openai: fakeAdapter('openai'),
    };

    beforeAll(async () => {
        harness = await startHausServerHarness({ imageGenerationAdapters: adapters });
        harness.humans.setVerifiedEmails('user_img_owner', ['ada@haus.test']);
        harness.humans.setVerifiedEmails('user_img_peer', ['bo@haus.test']);
        owner = createHausClient(harness, await harness.humans.mintSessionToken('user_img_owner'));
        peer = createHausClient(harness, await harness.humans.mintSessionToken('user_img_peer'));
        serverId = (
            await owner.trpc.server.create.mutate({ displayName: 'Img HQ', slug: 'img-hq' })
        ).id;
        await owner.trpc.member.updateProfile.mutate({
            description: null,
            displayName: 'Ada',
            handle: 'ada',
            serverId,
        });
        const { token } = await owner.trpc.invitation.create.mutate({
            email: 'bo@haus.test',
            serverId,
        });
        await peer.trpc.invitation.accept.mutate({ token });
        await peer.trpc.member.updateProfile.mutate({
            description: null,
            displayName: 'Bo',
            handle: 'bo',
            serverId,
        });
        const ownerId = await readUserId('user_img_owner');
        await harness.sql`
            insert into computers (
                id, server_id, attached_by_user_id, credential_hash, reported_inventory, health
            )
            values (
                ${computerId}, ${serverId}, ${ownerId}, ${credentialHash},
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
                name: 'art',
                serverId,
            })
        ).id;
        await harness.sql`
            insert into channel_participants (server_id, chat_id, user_id)
            values (${serverId}, ${channelId}, ${await readUserId('user_img_peer')})
        `;
    });

    afterAll(async () => {
        owner.close();
        peer.close();
        await harness?.close();
    });

    return {
        agentCall,
        behavior,
        get channelId() {
            return channelId;
        },
        create,
        get harness() {
            return harness;
        },
        mintRunner,
        get orbitAgentId() {
            return orbitAgentId;
        },
        get owner() {
            return owner;
        },
        get peer() {
            return peer;
        },
        providerCalls,
        rowCount,
        get serverId() {
            return serverId;
        },
        settled,
    };

    async function readUserId(subject: string) {
        const [row] = (await harness.sql`
            select id from users where auth_subject = ${subject}
        `) as { id: string }[];
        return row?.id ?? '';
    }

    async function mintRunner(runId: string, as?: { agentId: string; chatId: string }) {
        const response = await fetch(new URL('/computer/runner/mint', harness.url), {
            body: JSON.stringify({
                agentId: as?.agentId ?? orbitAgentId,
                chatId: as?.chatId ?? channelId,
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

    async function agentCall(
        runner: { token: string },
        method: 'GET' | 'POST',
        path: string,
        body?: object
    ) {
        const response = await fetch(new URL(path, harness.url), {
            body: body ? JSON.stringify(body) : undefined,
            headers: {
                authorization: `Bearer ${runner.token}`,
                'content-type': 'application/json',
            },
            method,
        });
        return {
            // biome-ignore lint/suspicious/noExplicitAny: tests read nested receipt fields directly.
            body: (await response.json()) as Record<string, any>,
            status: response.status,
        };
    }

    function create(runner: { token: string }, body: object) {
        return agentCall(runner, 'POST', '/api/agent/image-generation', {
            model: 'gpt-image-2.5-sunburst',
            prompt: 'a fox in a hat',
            ...body,
        });
    }

    async function settled(runner: { token: string }, generationId: string) {
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
            const polled = await agentCall(
                runner,
                'GET',
                `/api/agent/image-generation?generationId=${generationId}`
            );
            const generation = polled.body.generation as ImageGeneration;
            if (generation.result.state === 'ready' || generation.result.state === 'failed') {
                return generation;
            }
            await Bun.sleep(20);
        }
        throw new Error('The generation never settled.');
    }

    async function rowCount() {
        const [row] = (await harness.sql`
            select count(*)::int as total from image_generations where server_id = ${serverId}
        `) as { total: number }[];
        return row?.total ?? 0;
    }
}
