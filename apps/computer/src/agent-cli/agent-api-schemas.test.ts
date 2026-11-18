import { expect, test } from 'bun:test';

import { agentAutomationEventSchema, chatMessageReplySchema } from '@haus/api';

import { agentMessageCheckResponseSchema, agentMessageSchema } from './agent-api-schemas.ts';

const baseMessage = {
    attachments: [],
    author: { id: 'usr_wren', kind: 'user' as const, label: 'wren', metadata: {} },
    body_kind: 'text' as const,
    chat_id: 'cht_product',
    content: 'Set up the export',
    created_at: '2026-11-02T20:00:00.000Z',
    deleted_at: null,
    delivery_id: null,
    id: 'msg_1234567890abcdef',
    metadata: {},
    nonce: 'agent-api-schemas-test',
    role: 'user' as const,
    sender: { description: null, handle: 'wren', type: 'human' as const },
    sequence: 1,
};

/**
 * A current Server's inline reply, plus a field a future Server release
 * might additively send at every nesting level the shape reaches.
 */
const replyWithUnknownFields = {
    futureReplyField: true,
    parent: {
        author: { futureAuthorField: true, kind: 'human', userId: 'usr_root' },
        content: 'Earlier message',
        createdAt: '2026-11-02T19:00:00.000Z',
        futureReferenceField: true,
        id: 'msg_parent1234567890',
        sequence: 1,
    },
    parentMessageId: 'msg_parent1234567890',
    root: {
        author: { futureAuthorField: true, kind: 'human', userId: 'usr_root' },
        content: 'Root message',
        createdAt: '2026-11-02T18:00:00.000Z',
        futureReferenceField: true,
        id: 'msg_root1234567890',
        sequence: 1,
    },
    rootMessageId: 'msg_root1234567890',
};

test('the canonical strict inline reply schema rejects a field it does not know', () => {
    expect(() => chatMessageReplySchema.parse(replyWithUnknownFields)).toThrow(/futureReplyField/);
});

test('the Computer message schema tolerates an inline reply carrying fields from a newer Server, at every nesting level', () => {
    const parsed = agentMessageSchema.parse({ ...baseMessage, reply: replyWithUnknownFields });
    expect(parsed.reply?.parentMessageId).toBe('msg_parent1234567890');
});

const automationEventWithUnknownField = {
    content: 'A Trigger fired.',
    createdAt: '2026-11-02T20:00:00.000Z',
    futureAutomationField: true,
    id: 'trf_1234567890',
    senderHandle: 'trigger' as const,
    senderType: 'trigger' as const,
    target: '#product',
};

test('the canonical strict automation event schema rejects a field it does not know', () => {
    expect(() => agentAutomationEventSchema.parse(automationEventWithUnknownField)).toThrow(
        /futureAutomationField/
    );
});

test('the Computer message check response schema tolerates an automation event carrying fields from a newer Server', () => {
    const parsed = agentMessageCheckResponseSchema.parse({
        automations: [automationEventWithUnknownField],
        messages: [],
        more: false,
    });
    expect(parsed.automations[0]?.id).toBe('trf_1234567890');
});
