import { afterAll, beforeAll, expect, test } from 'bun:test';
import { agentUpdatedTopic, memberUpdatedTopic } from '../src/realtime/topics.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { captureTopic } from './realtime-capture.ts';

let harness: HausServerHarness;
let owner: HausClient;
let serverId: string;
let ownerUserId: string;
let agentId: string;

const computerId = 'cmp_eeeeeeeeeeeeeeee';
const credentialHash = 'e'.repeat(64);
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
    owner = await signIn('user_events_owner');

    const server = await owner.trpc.server.create.mutate({
        displayName: 'Events HQ',
        slug: 'events-hq',
    });
    serverId = server.id;
    ownerUserId = await readUserId('user_events_owner');

    await harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash, reported_inventory, health)
        values (
            ${computerId},
            ${serverId},
            ${ownerUserId},
            ${credentialHash},
            ${{ runtimes: [codexRuntime] }}::jsonb,
            'healthy'
        )
    `;

    const created = await owner.trpc.agent.create.mutate({
        computerId,
        description: 'Watches what the Server announces.',
        displayName: 'Signal',
        handle: 'signal',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId,
    });
    agentId = created.agent.id;
});

afterAll(async () => {
    owner.close();
    await harness.close();
});

test('configuring an Agent announces that Agent to the rest of the Server', async () => {
    const updates = captureTopic(agentUpdatedTopic);

    await owner.trpc.agent.configure.mutate({
        agentId,
        modelId: 'gpt-5.6-terra',
        runtimeId: 'codex',
        serverId,
    });

    expect(await updates.next()).toEqual({ agentId, serverId });
    updates.stop();
});

test('starting and stopping an Agent announces its delivery change', async () => {
    const updates = captureTopic(agentUpdatedTopic);

    await owner.trpc.agent.stop.mutate({ agentId, serverId });
    expect(await updates.next()).toEqual({ agentId, serverId });

    await owner.trpc.agent.start.mutate({ agentId, serverId });
    expect(await updates.next()).toEqual({ agentId, serverId });
    updates.stop();
});

test('a profile edit announces the human to every Server they belong to', async () => {
    const updates = captureTopic(memberUpdatedTopic);

    await owner.trpc.member.updateProfile.mutate({
        description: 'Keeps the Server honest.',
        displayName: 'Ada Lovelace',
        serverId,
    });

    expect(await updates.next((event) => event.serverId === serverId)).toEqual({
        memberId: ownerUserId,
        serverId,
    });
    updates.stop();
});

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
