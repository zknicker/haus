import { expect, test } from 'bun:test';
import type * as z from 'zod';
import type { AgentApiRequester } from '../agent-api-client.ts';
import type { AgentCliMessage } from '../agent-api-schemas.ts';
import { renderHistory } from '../agent-render.ts';
import { runCheck } from './agent-message.ts';

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

test('message check uses Raft empty-inbox wording', async () => {
    const outputs: string[] = [];
    const client: AgentApiRequester = {
        request: async <T>(_route: string, schema: z.ZodType<T>) =>
            schema.parse({ messages: [], more: false }) as T,
    };
    await runCheck(depsFor(client, outputs));

    expect(outputs[0]).toBe('No new messages.\n');
});

test('message check drains and aggregates multiple pages in one invocation', async () => {
    const outputs: string[] = [];
    const pages = [
        {
            messages: [{ message: message('msg_first', 1), target: '#general' }],
            more: true,
        },
        {
            messages: [{ message: message('msg_second', 2), target: 'dm:@operator' }],
            more: false,
        },
    ];
    let calls = 0;
    const client: AgentApiRequester = {
        request: async <T>(_route: string, schema: z.ZodType<T>) =>
            schema.parse(pages[calls++]) as T,
    };

    await runCheck(depsFor(client, outputs));

    expect(calls).toBe(2);
    expect(outputs[0]).toContain('msg=first');
    expect(outputs[0]).toContain('msg=second');
    expect(outputs[0]).toEndWith('No more new messages.\n');
});

test('message check explains a restored Thread follow and its exact undo command', async () => {
    const outputs: string[] = [];
    const client: AgentApiRequester = {
        request: async <T>(_route: string, schema: z.ZodType<T>) =>
            schema.parse({
                messages: [
                    {
                        message: message('msg_restored', 1),
                        target: '#general:deadbeef',
                        threadFollowReactivated: true,
                    },
                ],
                more: false,
            }) as T,
    };

    await runCheck(depsFor(client, outputs));

    expect(outputs[0]).toContain(
        '[Haus thread follow restored: this @mention re-subscribed you to ordinary replies in #general:deadbeef.]'
    );
    expect(outputs[0]).toContain(
        'To stop those replies again: haus thread unfollow --target "#general:deadbeef"'
    );
});

test('message check stops after Raft’s 50-round drain cap', async () => {
    const outputs: string[] = [];
    let calls = 0;
    const client: AgentApiRequester = {
        request: async <T>(_route: string, schema: z.ZodType<T>) => {
            calls += 1;
            return schema.parse({
                messages: [{ message: message(`msg_${calls}`, calls), target: '#general' }],
                more: true,
            }) as T;
        },
    };

    await runCheck(depsFor(client, outputs));

    expect(calls).toBe(50);
    expect(outputs[0]).toContain('body-msg_50');
    expect(outputs[0]).toEndWith('More messages are pending — run haus message check again.\n');
});

test('message check interleaves an automation fire with messages by createdAt', async () => {
    const outputs: string[] = [];
    const client: AgentApiRequester = {
        request: async <T>(_route: string, schema: z.ZodType<T>) =>
            schema.parse({
                automations: [
                    {
                        content: '\u26a1 Trigger: Sentry alerts',
                        createdAt: '2026-08-17T12:00:02.000Z',
                        id: 'trf_41c2d8e9ff',
                        senderHandle: 'trigger',
                        senderType: 'trigger',
                        target: '#general',
                    },
                ],
                messages: [
                    { message: message('msg_first', 1), target: '#general' },
                    { message: message('msg_third', 3), target: '#general' },
                ],
                more: false,
            }) as T,
    };

    await runCheck(depsFor(client, outputs));

    const lines = (outputs[0] ?? '').trimEnd().split('\n');
    expect(lines[0]).toContain('[target=#general msg=first ');
    // A fire addresses no Chat message, so its `msg=` slot is `-`.
    expect(lines[1]).toStartWith('[target=#general msg=- ');
    expect(lines[1]).toEndWith('type=trigger] @trigger: \u26a1 Trigger: Sentry alerts');
    expect(lines[2]).toContain('[target=#general msg=third ');
    expect(lines[3]).toBe('No more new messages.');
});

test('message check renders an automations-only pull instead of an empty inbox', async () => {
    const outputs: string[] = [];
    const client: AgentApiRequester = {
        request: async <T>(_route: string, schema: z.ZodType<T>) =>
            schema.parse({
                automations: [
                    {
                        content: '\ud83d\udd14 Reminder: Stand-up\nfire=rmf_9a8b7c6d',
                        createdAt: '2026-08-17T12:00:05.000Z',
                        id: 'rmf_9a8b7c6d',
                        senderHandle: 'reminder',
                        senderType: 'system',
                        target: 'dm:@operator',
                    },
                ],
                messages: [],
                more: false,
            }) as T,
    };

    await runCheck(depsFor(client, outputs));

    expect(outputs[0]).not.toContain('No new messages.');
    expect(outputs[0]).toContain(
        'type=system] @reminder: \ud83d\udd14 Reminder: Stand-up\nfire=rmf_9a8b7c6d'
    );
    expect(outputs[0]).toEndWith('No more new messages.\n');
});

test('message check pages on automations that arrive with no messages', async () => {
    const outputs: string[] = [];
    const pages = [
        {
            automations: [
                {
                    content: '\u26a1 Trigger: first fire',
                    createdAt: '2026-08-17T12:00:01.000Z',
                    id: 'trf_aaaaaaaa',
                    senderHandle: 'trigger',
                    senderType: 'trigger',
                    target: '#general',
                },
            ],
            messages: [],
            more: true,
        },
        {
            automations: [
                {
                    content: '\u26a1 Trigger: second fire',
                    createdAt: '2026-08-17T12:00:02.000Z',
                    id: 'trf_bbbbbbbb',
                    senderHandle: 'trigger',
                    senderType: 'trigger',
                    target: '#general',
                },
            ],
            messages: [],
            more: false,
        },
    ];
    let calls = 0;
    const client: AgentApiRequester = {
        request: async <T>(_route: string, schema: z.ZodType<T>) =>
            schema.parse(pages[calls++]) as T,
    };

    await runCheck(depsFor(client, outputs));

    expect(calls).toBe(2);
    // Neither page's fire prints an id in `msg=`; the body names which fire it is.
    expect(outputs[0]).toContain('type=trigger] @trigger: \u26a1 Trigger: first fire');
    expect(outputs[0]).toContain('type=trigger] @trigger: \u26a1 Trigger: second fire');
    expect(outputs[0]).toContain('[target=#general msg=- ');
    expect(outputs[0]).not.toContain('msg=aaaaaaaa');
    expect(outputs[0]).toEndWith('No more new messages.\n');
});

test('message check renders a task assignment through the fire envelope header', async () => {
    const outputs: string[] = [];
    const client: AgentApiRequester = {
        request: async <T>(_route: string, schema: z.ZodType<T>) =>
            schema.parse({
                automations: [
                    {
                        content:
                            '[Haus task assignment task=#7 target=#general assignedBy=@operator] Ship the release notes',
                        createdAt: '2026-08-17T12:00:04.000Z',
                        id: 'task-assign:msg_1a2b3c4d5e6f:3',
                        senderHandle: 'haus',
                        senderType: 'system',
                        target: '#general',
                    },
                ],
                messages: [],
                more: false,
            }) as T,
    };

    await runCheck(depsFor(client, outputs));

    const lines = (outputs[0] ?? '').trimEnd().split('\n');
    // The assignment key shortens to the task message it hands over, which is
    // the id the Agent can actually read, thread on, or react to.
    expect(lines[0]).toStartWith('[target=#general msg=1a2b3c4d ');
    expect(lines[0]).toEndWith(
        'type=system] @haus: [Haus task assignment task=#7 target=#general assignedBy=@operator] Ship the release notes'
    );
    expect(outputs[0]).not.toContain('No new messages.');
});

test('message check orders a task assignment against fires and messages by createdAt', async () => {
    const outputs: string[] = [];
    const client: AgentApiRequester = {
        request: async <T>(_route: string, schema: z.ZodType<T>) =>
            schema.parse({
                automations: [
                    {
                        content: '[Haus task assignment task=#7 target=#general] Ship it',
                        createdAt: '2026-08-17T12:00:02.000Z',
                        id: 'task-assign:msg_1a2b3c4d5e6f:3',
                        senderHandle: 'haus',
                        senderType: 'system',
                        target: '#general',
                    },
                    {
                        content: '\u26a1 Trigger: Sentry alerts',
                        createdAt: '2026-08-17T12:00:03.000Z',
                        id: 'trf_41c2d8e9ff',
                        senderHandle: 'trigger',
                        senderType: 'trigger',
                        target: '#general',
                    },
                ],
                messages: [
                    { message: message('msg_first', 1), target: '#general' },
                    { message: message('msg_fourth', 4), target: '#general' },
                ],
                more: false,
            }) as T,
    };

    await runCheck(depsFor(client, outputs));

    const lines = (outputs[0] ?? '').trimEnd().split('\n');
    expect(lines[0]).toContain('[target=#general msg=first ');
    expect(lines[1]).toContain('@haus: [Haus task assignment task=#7 target=#general] Ship it');
    expect(lines[2]).toContain('@trigger: \u26a1 Trigger: Sentry alerts');
    expect(lines[3]).toContain('[target=#general msg=fourth ');
    expect(lines[4]).toBe('No more new messages.');
});

test('history preserves restoration guidance when it is the first visible path', () => {
    const output = renderHistory({
        has_more: false,
        has_newer: false,
        has_older: false,
        last_read: { after: 0, unread_after: -1 },
        messages: [message('msg_restored', 1)],
        target: '#general:deadbeef',
        thread_follow_reactivated_message_ids: ['msg_restored'],
    });

    expect(output).toContain(
        '[Haus thread follow restored: this @mention re-subscribed you to ordinary replies in #general:deadbeef.]'
    );
    expect(output).toContain(
        'To stop those replies again: haus thread unfollow --target "#general:deadbeef"'
    );
});
