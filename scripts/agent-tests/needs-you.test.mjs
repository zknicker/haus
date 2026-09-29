import { expect, test } from 'bun:test';
import {
    answerPlacement,
    findNeedsYouRow,
    humanAddressingReason,
    humanAuthorId,
    humanMentionLink,
    mentionsHuman,
    staleNeedsYouRow,
} from './needs-you.mjs';

const row = (chatId, sequence) => ({ chatId, latest: { sequence } });

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

test("any message in a Thread on the human's message addresses them as a reply", () => {
    const ada = { kind: 'human', userId: 'usr_ada' };
    expect(humanAddressingReason({ content: 'Option one.' }, 'usr_ada', ada)).toBe('reply');
    expect(humanAddressingReason({ content: '[@Ada](user://usr_ada) pick?' }, 'usr_ada', ada)).toBe(
        'mention'
    );
    expect(
        humanAddressingReason({ content: 'Option one.' }, 'usr_ada', {
            kind: 'human',
            userId: 'usr_bo',
        })
    ).toBe(null);
    expect(
        humanAddressingReason({ content: 'Option one.' }, 'usr_ada', {
            agentId: 'agt_x',
            kind: 'agent',
        })
    ).toBe(null);
});

test('a row answered through a sequence is stale; newer addressing is not', () => {
    const rows = [row('cht_thread', 7), row('cht_other', 2)];
    expect(findNeedsYouRow(rows, 'cht_thread')).toEqual(row('cht_thread', 7));
    expect(findNeedsYouRow(rows, 'cht_missing')).toBe(null);
    expect(staleNeedsYouRow(rows, 'cht_thread', 7)).toEqual(row('cht_thread', 7));
    expect(staleNeedsYouRow(rows, 'cht_thread', 6)).toBe(null);
    expect(staleNeedsYouRow(rows, 'cht_missing', 9)).toBe(null);
});

test('answers inside the Thread the question arrived in, or inline at top level', () => {
    expect(
        answerPlacement({
            channelId: 'cht_channel',
            questionId: 'msg_question',
            thread: { anchorMessageId: 'msg_anchor', chatId: 'cht_thread' },
        })
    ).toEqual({
        chatId: 'cht_channel',
        needsYouChatId: 'cht_thread',
        thread: { anchorMessageId: 'msg_anchor' },
    });
    expect(
        answerPlacement({ channelId: 'cht_channel', questionId: 'msg_question', thread: null })
    ).toEqual({
        chatId: 'cht_channel',
        needsYouChatId: 'cht_channel',
        replyToMessageId: 'msg_question',
    });
});

test('reads the human identity only off a human-authored message', () => {
    expect(humanAuthorId({ author: { kind: 'human', userId: 'usr_ada' } })).toBe('usr_ada');
    expect(() => humanAuthorId({ author: { agentId: 'agt_x', kind: 'agent' } })).toThrow();
    expect(() => humanAuthorId(undefined)).toThrow();
});
