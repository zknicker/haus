import { afterAll, expect, test } from 'bun:test';
import type { ChatEngagementEvent } from '@haus/api';
import { subscribeToChatEngagements } from '../src/agent-delivery/chat-engagement-events.ts';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();
const feed = new AbortController();
const events: ChatEngagementEvent[] = [];
void (async () => {
    for await (const event of subscribeToChatEngagements(feed.signal)) {
        events.push(event);
    }
})().catch(() => undefined);

afterAll(() => feed.abort());

async function completesReply(messageId: string) {
    const [row] = (await fixture.harness.sql`
        select completes_reply as "completesReply" from chat_messages where id = ${messageId}
    `) as Array<{ completesReply: boolean }>;
    return row?.completesReply;
}

async function send(runner: { token: string }, body: Record<string, unknown>) {
    const response = await fixture.post('/api/agent/messages/send', runner, {
        target: '#product',
        ...body,
    });
    const sent = response.body as { message?: { id: string }; state?: string };
    expect(response.status).toBe(200);
    expect(sent.state).toBe('sent');
    await new Promise((resolve) => setTimeout(resolve, 0));
    return sent.message?.id ?? '';
}

test('a send without done, as an older CLI makes it, commits and ends no engagement', async () => {
    const runner = await fixture.mintRunner('run_send_done_plain');
    const messageId = await send(runner, { content: 'Checking now.', nonce: 'plain_interim' });

    expect(await completesReply(messageId)).toBe(false);
    expect(events.filter((event) => event.runId === runner.runId)).toEqual([]);
});

test('a --done send records the completed reply and ends that Chat as sent', async () => {
    const runner = await fixture.mintRunner('run_send_done_final');
    const messageId = await send(runner, {
        content: 'The deploy is green.',
        done: true,
        nonce: 'done_final',
    });

    expect(await completesReply(messageId)).toBe(true);
    expect(events.filter((event) => event.runId === runner.runId)).toMatchObject([
        { chatId: fixture.channelId, reason: 'sent', type: 'chat.engagement.ended' },
    ]);
});
