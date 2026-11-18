import { expect, test } from 'bun:test';
import {
    answerPlacement,
    humanAddressingReason,
    humanAuthorId,
    humanMentionLink,
    mentionsHuman,
} from './human-addressing.mjs';

test('recognizes a resolved human mention by its user:// link, not the bare handle', () => {
    expect(humanMentionLink('usr_ada')).toBe('user://usr_ada');
    expect(mentionsHuman('[@Ada Lovelace](user://usr_ada) which tagline?', 'usr_ada')).toBe(true);
    expect(mentionsHuman('@ada which tagline?', 'usr_ada')).toBe(false);
    expect(mentionsHuman('[@Bo](user://usr_ada2) hi', 'usr_ada')).toBe(false);
    expect(mentionsHuman(undefined, 'usr_ada')).toBe(false);
});

test('an @mention or an inline reply to the human addresses them; mention wins', () => {
    const replyTo = (userId) => ({
        reply: { parent: { author: { kind: 'human', userId } }, parentMessageId: 'msg_q' },
    });
    const mention = '[@Ada](user://usr_ada) which one?';
    expect(humanAddressingReason({ content: mention }, 'usr_ada')).toBe('mention');
    expect(humanAddressingReason({ content: mention, ...replyTo('usr_ada') }, 'usr_ada')).toBe(
        'mention'
    );
    expect(humanAddressingReason({ content: 'Which one?', ...replyTo('usr_ada') }, 'usr_ada')).toBe(
        'reply'
    );
    expect(humanAddressingReason({ content: 'Which one?', ...replyTo('usr_bo') }, 'usr_ada')).toBe(
        null
    );
    expect(
        humanAddressingReason(
            {
                content: 'Which one?',
                reply: { parent: { author: { agentId: 'agt_x', kind: 'agent' } } },
            },
            'usr_ada'
        )
    ).toBe(null);
    expect(humanAddressingReason({ content: 'Which one?', reply: null }, 'usr_ada')).toBe(null);
});

test('a plain message that neither mentions nor replies to the human does not address them', () => {
    expect(humanAddressingReason({ content: 'Option one.' }, 'usr_ada')).toBe(null);
});

test('the human answers inline under the question', () => {
    expect(answerPlacement({ channelId: 'cht_channel', questionId: 'msg_question' })).toEqual({
        chatId: 'cht_channel',
        answerChatId: 'cht_channel',
        replyToMessageId: 'msg_question',
    });
});

test('reads the human identity only off a human-authored message', () => {
    expect(humanAuthorId({ author: { kind: 'human', userId: 'usr_ada' } })).toBe('usr_ada');
    expect(() => humanAuthorId({ author: { agentId: 'agt_x', kind: 'agent' } })).toThrow();
    expect(() => humanAuthorId(undefined)).toThrow();
});
