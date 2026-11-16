import { afterAll, beforeAll, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { claimChangedTopic } from '../src/realtime/topics.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { captureTopic } from './realtime-capture.ts';

/**
 * `claim.changed` names the Chat the claim's Message sits in: the App
 * invalidates that Message's entity by it, and the stream delivers only to
 * members who can open it. A top-level claim's work Thread is not that Chat,
 * and before the first reply it does not exist at all.
 */

let harness: HausServerHarness;
let owner: HausClient;

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = createHausClient(harness, await harness.humans.mintSessionToken('user_claim_events'));
});

afterAll(async () => {
    owner.close();
    await harness.close();
});

test('App status and assignment changes of a top-level claim name its Channel', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Claim Events',
        slug: 'claim-events',
    });
    const chatId = server.channels[0].id;
    const agentId = await addChannelAgent(server.id, chatId);
    const created = await owner.trpc.claim.create.mutate({
        chatId,
        content: 'Name the right Chat',
        nonce: 'claim-events-top-level',
        serverId: server.id,
    });
    const { messageId } = created.claim;
    const expected = { chatId, kind: 'updated', messageId, serverId: server.id };
    const delivered = captureTopic(claimChangedTopic);

    // Before any reply: the anchored Thread does not exist yet.
    const updated = await owner.trpc.claim.update.mutate({
        expectedVersion: created.claim.version,
        messageId,
        patch: { status: 'in_progress' },
        serverId: server.id,
    });
    expect(await delivered.next()).toEqual(expected);
    const assigned = await owner.trpc.claim.assign.mutate({
        assignee: { agentId },
        expectedVersion: updated.claim.version,
        messageId,
        serverId: server.id,
    });
    expect(await delivered.next()).toEqual(expected);

    // After the first reply materializes the Thread, the Message still sits in the Channel.
    await owner.trpc.chat.send.mutate({
        chatId,
        content: 'First reply',
        nonce: 'claim-events-thread-reply',
        serverId: server.id,
        thread: { anchorMessageId: messageId },
    });
    const reviewed = await owner.trpc.claim.update.mutate({
        expectedVersion: assigned.claim.version,
        messageId,
        patch: { status: 'in_review' },
        serverId: server.id,
    });
    expect(await delivered.next((event) => event.messageId === messageId)).toEqual(expected);
    await owner.trpc.claim.assign.mutate({
        assignee: null,
        expectedVersion: reviewed.claim.version,
        messageId,
        serverId: server.id,
    });
    expect(await delivered.next((event) => event.messageId === messageId)).toEqual(expected);
    delivered.stop();
});

async function addChannelAgent(serverId: string, chatId: string) {
    const computerId = `cmp_${randomBytes(12).toString('base64url')}`;
    const agentId = `agt_${randomBytes(12).toString('base64url')}`;
    const [{ id: attachedByUserId }] = (await harness.sql`
        select user_id as id from server_memberships
        where server_id = ${serverId} and role = 'owner' limit 1
    `) as { id: string }[];
    await harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash)
        values (${computerId}, ${serverId}, ${attachedByUserId}, ${randomBytes(32).toString('hex')})
    `;
    await harness.sql`
        insert into agents (id, server_id, computer_id, handle, display_name,
            desired_model_id, desired_runtime_id, home_timezone)
        values (${agentId}, ${serverId}, ${computerId}, 'ada', 'Ada',
            'fake-model', 'fake', 'UTC')
    `;
    await harness.sql`
        insert into channel_agent_participants (server_id, chat_id, agent_id)
        values (${serverId}, ${chatId}, ${agentId})
    `;
    return agentId;
}
