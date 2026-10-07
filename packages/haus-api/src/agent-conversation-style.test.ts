import { expect, test } from 'bun:test';
import { agentStartCommandSchema } from './agent-delivery-frames.ts';
import {
    agentSelfProfileUpdateInputSchema,
    updateAgentConversationStyleInputSchema,
} from './agent-profile.ts';
import { signatureEmojiInputSchema, signatureEmojiRule } from './agent-profile-text.ts';

const target = { agentId: 'agt_1', serverId: 'srv_1' };

test('a conversation style write may omit, set, or clear each field, within its cap', () => {
    const parse = (input: object) =>
        updateAgentConversationStyleInputSchema.parse({ ...target, ...input });
    expect(parse({})).toEqual(target);
    expect(parse({ conversationStyle: '  Terse.  ' }).conversationStyle).toBe('Terse.');
    expect(parse({ conversationStyle: null, signatureEmoji: null })).toMatchObject({
        conversationStyle: null,
        signatureEmoji: null,
    });
    expect(
        updateAgentConversationStyleInputSchema.safeParse({
            ...target,
            conversationStyle: 'x'.repeat(2001),
        }).success
    ).toBe(false);
});

test('a signature emoji is exactly one emoji grapheme, stored fully qualified', () => {
    for (const emoji of ['🦊', '👍🏽', '👩‍🚀', '🇯🇵', '❤️']) {
        expect(signatureEmojiInputSchema.parse(emoji)).toBe(emoji);
    }
    expect(signatureEmojiInputSchema.parse(' ❤ ')).toBe('❤️');
    // One grapheme that stacks modifiers past the database's 64-character check.
    const stacked = `👍${'🏻'.repeat(70)}`;
    for (const refused of ['', 'ok', '🦊🦊', '7', ':fox:', stacked]) {
        const result = signatureEmojiInputSchema.safeParse(refused);
        expect(result.success).toBe(false);
        expect(result.error?.issues[0]?.message).toBe(signatureEmojiRule);
    }
});

test('an Agent self-update names no target and must change something', () => {
    expect(agentSelfProfileUpdateInputSchema.safeParse({}).success).toBe(false);
    expect(
        agentSelfProfileUpdateInputSchema.safeParse({ agent: '@peer', signatureEmoji: '🦊' })
            .success
    ).toBe(false);
    expect(agentSelfProfileUpdateInputSchema.parse({ signatureEmoji: '🦊' })).toEqual({
        signatureEmoji: '🦊',
    });
    expect(
        agentSelfProfileUpdateInputSchema.parse({ conversationStyle: null, description: 'Role.' })
    ).toEqual({ conversationStyle: null, description: 'Role.' });
});

test('the start frame carries an optional conversation style and a nullable signature emoji', () => {
    const frame = {
        agentId: 'agt_1',
        chatId: 'cht_1',
        inboxDelivery: 'notice',
        modelId: 'm',
        runId: 'run_1',
        runtimeId: 'codex',
        sessionGeneration: 1,
        totalPending: 0,
        type: 'start',
    };
    const bare = agentStartCommandSchema.parse(frame);
    expect(bare.agentConversationStyle).toBeUndefined();
    expect(bare.agentSignatureEmoji).toBeNull();
    const styled = agentStartCommandSchema.parse({
        ...frame,
        agentConversationStyle: 'Terse.',
        agentSignatureEmoji: '🦊',
    });
    expect(styled).toMatchObject({ agentConversationStyle: 'Terse.', agentSignatureEmoji: '🦊' });
});
