import { expect, test } from 'bun:test';
import type * as z from 'zod';
import type { AgentApiRequester } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import { messageSendSubcommand, runSend } from './agent-message-send.ts';

const sent = {
    message: {
        attachments: [],
        author: { id: 'agt_orbit', kind: 'agent', label: 'Orbit', metadata: {} },
        body_kind: 'text',
        chat_id: 'cht_general',
        content: 'The deploy is green.',
        created_at: '2026-09-25T12:00:00.000Z',
        deleted_at: null,
        delivery_id: null,
        id: 'msg_sent',
        metadata: {},
        nonce: 'nonce',
        role: 'assistant',
        sender: { description: null, handle: 'orbit', type: 'agent' },
        sequence: 7,
    },
    recentUnread: [],
    state: 'sent',
};

function args(flags: Record<string, boolean> = {}): ParsedArgs {
    return {
        flags,
        help: false,
        positionals: [],
        valueLists: {},
        values: { '--reply-to': '1234abcd', '--target': '#general' },
    };
}

/** Answers each request with the next response, recording every body. */
function scriptedClient(bodies: unknown[], responses: Array<'sent' | AgentCliError>) {
    const client: AgentApiRequester = {
        request: async <T>(_route: string, schema: z.ZodType<T>, input?: { body?: unknown }) => {
            bodies.push(input?.body);
            const next = responses.shift();
            if (next instanceof AgentCliError) {
                throw next;
            }
            return schema.parse(sent);
        },
    };
    return {
        client,
        mintNonce: () => 'nonce',
        readStdin: async () => 'The deploy is green.',
        stdinIsTty: false,
        write: () => undefined,
    };
}

test('--done marks the send as completing the reply', async () => {
    const bodies: unknown[] = [];
    await runSend(args({ '--done': true }), scriptedClient(bodies, ['sent']));
    expect(bodies).toEqual([
        {
            content: 'The deploy is green.',
            done: true,
            nonce: 'nonce',
            replyToMessageId: '1234abcd',
            target: '#general',
        },
    ]);
});

test('an interim send omits done so an older Server accepts it unchanged', async () => {
    const bodies: unknown[] = [];
    await runSend(args(), scriptedClient(bodies, ['sent']));
    expect(bodies[0]).not.toHaveProperty('done');
});

test('--done resends plain, same nonce, when an older Server refuses the unknown field', async () => {
    const bodies: Record<string, unknown>[] = [];
    const refusal = new AgentCliError('INVALID_ARG', 'The message send request was invalid.');
    await runSend(args({ '--done': true }), scriptedClient(bodies as unknown[], [refusal, 'sent']));
    expect(bodies).toHaveLength(2);
    expect(bodies[0]?.done).toBe(true);
    expect(bodies[1]).not.toHaveProperty('done');
    expect(bodies[1]?.nonce).toBe(bodies[0]?.nonce);
});

test('--done never retries any other refusal', async () => {
    const bodies: unknown[] = [];
    const refusal = new AgentCliError('INVALID_ARG', 'That reply parent is not in this chat.');
    await expect(
        runSend(args({ '--done': true }), scriptedClient(bodies, [refusal, 'sent']))
    ).rejects.toBe(refusal);
    expect(bodies).toHaveLength(1);
});

test('--done is a documented boolean flag on haus message send', () => {
    const flag = messageSendSubcommand.flags.find((candidate) => candidate.name === '--done');
    expect(flag?.valueName).toBeUndefined();
    expect(flag?.description).toContain('completes your reply');
    expect(messageSendSubcommand.usage).toContain('[--done]');
});
