import { beforeAll, expect, test } from 'bun:test';
import type { MessageRouter, RoutingState } from '../src/message-routing/jev.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import { createInlineReplyHelpers } from './haus-inline-replies-helpers.ts';

const calls: RoutingState[] = [];
const router: MessageRouter = {
    judge: async (state) => {
        calls.push(state);
        return { kind: 'broadcast', reason: 'uncertain' };
    },
    judgeMentionScope: async (state) => {
        calls.push(state);
        return { kind: 'broadcast', reason: 'uncertain' };
    },
};
const fixture = agentCreationFixture(router);
const { recipients, sendAgentMessage } = createInlineReplyHelpers(fixture);
let all = { id: '', name: '' };

beforeAll(async () => {
    const [row] = (await fixture.harness.sql`
        select id, name from chats where server_id = ${fixture.serverId} and is_all
    `) as { id: string; name: string }[];
    all = row ?? all;
    await fixture.harness.sql`
        update agents set home_project_id = ${all.id} where id = ${fixture.peerAgentId}
    `;
});

test('an unaddressed message in #all reaches nobody and never asks Jev', async () => {
    const before = calls.length;
    const sent = await send('Morning, everyone.');

    expect(await recipients(sent)).toEqual([]);
    expect(calls.length).toBe(before);
});

test('an @mention in #all reaches only the mentioned Captain, and Jev never widens it', async () => {
    const before = calls.length;
    const sent = await send('@orbit can you look at the export?');

    expect(await recipients(sent)).toEqual([{ agentId: fixture.orbitAgentId, mentioned: true }]);
    expect(calls.length).toBe(before);
});

test('an inline reply to a Captain’s own #all message wakes that Captain', async () => {
    const orbit = await fixture.mintRunner('run_all_orbit_root', fixture.orbitAgentId, all.id);
    const root = await sendAgentMessage(orbit.token, {
        content: 'Hi all, I am Orbit. I keep the release notes.',
        nonce: createOpaqueId('n'),
        target: `#${all.name}`,
    });
    const rootId = root.body.message?.id ?? '';

    expect(root.body.state).toBe('sent');
    expect(await follows(rootId)).toEqual([{ agentId: fixture.orbitAgentId, followed: true }]);
    expect(await recipients(await send('Welcome, Orbit!', rootId))).toEqual([
        { agentId: fixture.orbitAgentId, mentioned: false },
    ]);
});

test('a human-to-human inline reply in #all wakes nobody', async () => {
    const root = await send('Lunch at noon?');

    expect(await recipients(await send('Count me in.', root))).toEqual([]);
});

async function send(content: string, replyToMessageId?: string) {
    const sent = await fixture.owner.trpc.chat.send.mutate({
        chatId: all.id,
        content,
        nonce: createOpaqueId('n'),
        replyToMessageId,
        serverId: fixture.serverId,
    });
    return sent.message.id;
}

async function follows(rootMessageId: string) {
    return (await fixture.harness.sql`
        select agent_id as "agentId", followed from agent_message_follows
        where server_id = ${fixture.serverId} and chat_id = ${all.id}
          and root_message_id = ${rootMessageId}
        order by agent_id
    `) as { agentId: string; followed: boolean }[];
}
