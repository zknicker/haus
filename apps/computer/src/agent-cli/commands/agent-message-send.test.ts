import { expect, test } from 'bun:test';
import type * as z from 'zod';
import type { AgentApiRequester } from '../agent-api-client.ts';
import type { AgentCliMessage } from '../agent-api-schemas.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import { runSend } from './agent-message.ts';

function message(id: string, sequence: number): AgentCliMessage {
    return {
        attachments: [],
        author: { id: 'usr_operator', kind: 'user', label: 'Operator', metadata: {} },
        body_kind: 'text',
        chat_id: 'chat_messages',
        content: `body-${id}`,
        created_at: `2026-08-17T12:00:${String(sequence).padStart(2, '0')}.000Z`,
        deleted_at: null,
        delivery_id: null,
        id,
        metadata: {},
        nonce: null,
        role: 'user',
        sender: { description: null, handle: 'operator', type: 'human' },
        sequence,
    };
}

function depsFor(client: AgentApiRequester, outputs: string[]) {
    return {
        client,
        mintNonce: () => 'nonce',
        readStdin: async () => '',
        stdinIsTty: false,
        write: (text: string) => outputs.push(text),
    };
}

function sendArgs(
    values: Record<string, string>,
    flags: Record<string, boolean> = {},
    valueLists: Record<string, string[]> = {}
): ParsedArgs {
    return { flags, help: false, positionals: [], valueLists, values };
}

interface CapturedSend {
    body?: Record<string, unknown>;
}

function capturingSendClient(captured: CapturedSend): AgentApiRequester {
    return {
        request: async <T>(_route: string, schema: z.ZodType<T>, input?: { body?: unknown }) => {
            captured.body = input?.body as Record<string, unknown>;
            return schema.parse({
                message: message('msg_sent', 7),
                recentUnread: [],
                state: 'sent',
            }) as T;
        },
    };
}

test('send passes --cause through as the request body cause for a stdin send', async () => {
    const captured: CapturedSend = {};
    const deps = {
        ...depsFor(capturingSendClient(captured), []),
        readStdin: async () => 'the webhook failed twice',
    };

    await runSend(sendArgs({ '--target': '#general', '--cause': 'trf_41c2d8e9' }), deps);

    expect(captured.body).toEqual({
        cause: 'trf_41c2d8e9',
        content: 'the webhook failed twice',
        nonce: 'nonce',
        target: '#general',
    });
});

test('inline send preserves the channel and passes its parent reference', async () => {
    const captured: CapturedSend = {};
    await runSend(sendArgs({ '--target': '#general', '--reply-to': '1234abcd' }), {
        ...depsFor(capturingSendClient(captured), []),
        readStdin: async () => 'Here is the result.',
    });
    expect(captured.body).toEqual({
        content: 'Here is the result.',
        nonce: 'nonce',
        replyToMessageId: '1234abcd',
        target: '#general',
    });
});

test('saved drafts cannot be retargeted to a different inline parent', async () => {
    const captured: CapturedSend = {};
    await expect(
        runSend(
            sendArgs(
                { '--target': '#general', '--reply-to': '1234abcd' },
                { '--send-draft': true }
            ),
            depsFor(capturingSendClient(captured), [])
        )
    ).rejects.toThrow('--send-draft preserves the saved reply target');
    expect(captured.body).toBeUndefined();
});

test('send carries --cause alongside attachments', async () => {
    const captured: CapturedSend = {};
    const deps = {
        ...depsFor(capturingSendClient(captured), []),
        readStdin: async () => 'chart attached',
    };

    await runSend(
        sendArgs(
            { '--target': 'dm:@richard', '--cause': 'rmf_9a8b7c6d', '--attachment-id': 'att_2' },
            {},
            { '--attachment-id': ['att_1', 'att_2'] }
        ),
        deps
    );

    expect(captured.body).toEqual({
        attachmentIds: ['att_1', 'att_2'],
        cause: 'rmf_9a8b7c6d',
        content: 'chart attached',
        nonce: 'nonce',
        target: 'dm:@richard',
    });
});

test('send carries --cause in the --send-draft and --anyway modes', async () => {
    const draft: CapturedSend = {};
    await runSend(
        sendArgs({ '--target': '#general', '--cause': 'trf_41c2d8e9' }, { '--send-draft': true }),
        depsFor(capturingSendClient(draft), [])
    );
    expect(draft.body).toEqual({
        cause: 'trf_41c2d8e9',
        nonce: 'nonce',
        sendDraft: true,
        target: '#general',
    });

    const anyway: CapturedSend = {};
    await runSend(
        sendArgs(
            { '--target': '#general:00000000', '--cause': 'rmf_9a8b7c6d' },
            { '--send-draft': true, '--anyway': true }
        ),
        depsFor(capturingSendClient(anyway), [])
    );
    expect(anyway.body).toEqual({
        cause: 'rmf_9a8b7c6d',
        continueAnyway: true,
        nonce: 'nonce',
        sendDraft: true,
        target: '#general:00000000',
    });
});

test('send omits cause entirely when no fire caused the message', async () => {
    const captured: CapturedSend = {};
    const deps = {
        ...depsFor(capturingSendClient(captured), []),
        readStdin: async () => 'ordinary reply',
    };

    await runSend(sendArgs({ '--target': '#general' }), deps);

    expect(captured.body).not.toHaveProperty('cause');
});

test('send rejects an empty --cause locally before any request', async () => {
    let called = false;
    const client: AgentApiRequester = {
        request: async () => {
            called = true;
            throw new Error('unreachable');
        },
    };

    await expect(
        runSend(sendArgs({ '--target': '#general', '--cause': '  ' }), depsFor(client, []))
    ).rejects.toMatchObject({ code: 'INVALID_ARG', message: '--cause requires a fire id.' });
    expect(called).toBe(false);
});

test('send surfaces the Server INVALID_ARG message for an unusable cause', async () => {
    const client: AgentApiRequester = {
        request: async () => {
            throw new AgentCliError(
                'INVALID_ARG',
                'cause trf_41c2d8e9 belongs to a trigger you do not own.'
            );
        },
    };
    const deps = {
        ...depsFor(client, []),
        readStdin: async () => 'body',
    };

    await expect(
        runSend(sendArgs({ '--target': '#general', '--cause': 'trf_41c2d8e9' }), deps)
    ).rejects.toMatchObject({
        code: 'INVALID_ARG',
        message: 'cause trf_41c2d8e9 belongs to a trigger you do not own.',
    });
});
