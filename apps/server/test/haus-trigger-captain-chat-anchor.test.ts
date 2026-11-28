import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHomedAgent } from './agent-home.fixture.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { captureAllTopics, publishedSince } from './realtime-capture.ts';

let harness: HausServerHarness;
let owner: HausClient;
let serverId: string;

const computerId = 'cmp_triggerdmhost001';
const credentialHash = 'e'.repeat(64);
const codexRuntime = { id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] };

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = createHausClient(
        harness,
        await harness.humans.mintSessionToken('user_trigger_dm_owner')
    );
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Trigger Anchor Server',
        slug: 'trigger-anchor-server',
    });
    serverId = server.id;
    const [user] = (await harness.sql`
        select id from users where auth_subject = 'user_trigger_dm_owner'
    `) as { id: string }[];
    await harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash, reported_inventory, health)
        values (${computerId}, ${serverId}, ${user.id}, ${credentialHash}, ${{ runtimes: [codexRuntime] }}::jsonb, 'healthy')
    `;
});

afterAll(async () => {
    owner?.close();
    await harness?.close();
});

test('human-created triggers anchor in the Captain chat without opening a chat', async () => {
    const larkAgentId = await createAgent('Lark', 'lark');
    const [captainChat] = (await harness.sql`
        select id from chats
        where server_id = ${serverId} and kind = 'captain' and captain_agent_id = ${larkAgentId}
    `) as { id: string }[];
    const realtime = captureAllTopics();
    const first = await owner.trpc.trigger.create.mutate({
        agentId: larkAgentId,
        kind: 'webhook',
        serverId,
        title: 'First trigger',
    });
    const second = await owner.trpc.trigger.create.mutate({
        agentId: larkAgentId,
        kind: 'webhook',
        serverId,
        title: 'Second trigger',
    });

    const events = await publishedSince(realtime, serverId);
    realtime.stop();
    expect(first.trigger.anchorChatId).toBe(captainChat.id);
    expect(second.trigger.anchorChatId).toBe(captainChat.id);
    expect(events.filter((event) => event.type === 'chat.lifecycle')).toEqual([]);
});

async function createAgent(displayName: string, handle: string) {
    const created = await createHomedAgent(owner, {
        computerId,
        displayName,
        handle,
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId,
    });
    return created.agent.id;
}
