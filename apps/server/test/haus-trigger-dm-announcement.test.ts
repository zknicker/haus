import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

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
        await harness.clerk.mintSessionToken('user_trigger_dm_owner')
    );
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Trigger DM Server',
        slug: 'trigger-dm-server',
    });
    serverId = server.id;
    const [user] = (await harness.sql`
        select id from users where clerk_user_id = 'user_trigger_dm_owner'
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

test('announces the creator DM once when a human-created trigger first opens it', async () => {
    const larkAgentId = await createAgent('Lark', 'lark');
    const before = await owner.trpc.chat.eventHead.query({ serverId });
    const first = await owner.trpc.trigger.create.mutate({
        agentId: larkAgentId,
        kind: 'webhook',
        serverId,
        title: 'Opens the DM',
    });
    await owner.trpc.trigger.create.mutate({
        agentId: larkAgentId,
        kind: 'webhook',
        serverId,
        title: 'Reuses the DM',
    });

    const events = await owner.trpc.chat.events.query({
        afterCursor: before.cursor,
        serverId,
    });
    expect(
        events.filter(
            (event) =>
                event.type === 'chat.lifecycle' && event.chatId === first.trigger.anchorChatId
        )
    ).toEqual([expect.objectContaining({ action: 'created', type: 'chat.lifecycle' })]);
});

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
