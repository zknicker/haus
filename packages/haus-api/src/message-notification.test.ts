import { expect, test } from 'bun:test';
import {
    type MessageNotificationFacts,
    messageNotificationCandidates,
    messageNotificationReason,
} from './message-notification.ts';

const channel: MessageNotificationFacts = {
    authorUserId: null,
    conversationKind: 'channel',
    mentionedUserIds: [],
    replyToAuthorUserId: null,
    threadAnchorAuthorUserId: null,
};

test('every DM message notifies its other member, whoever it names', () => {
    const dm = { ...channel, conversationKind: 'dm' } as const;
    expect(messageNotificationReason(dm, 'usr_ada')).toBe('dm');
    expect(messageNotificationReason({ ...dm, mentionedUserIds: ['usr_ada'] }, 'usr_ada')).toBe(
        'dm'
    );
    expect(messageNotificationReason({ ...dm, authorUserId: 'usr_bo' }, 'usr_ada')).toBe('dm');
});

test('a Channel message notifies only the humans it mentions or answers', () => {
    expect(messageNotificationReason(channel, 'usr_ada')).toBeNull();
    expect(
        messageNotificationReason({ ...channel, mentionedUserIds: ['usr_ada'] }, 'usr_ada')
    ).toBe('mention');
    expect(
        messageNotificationReason({ ...channel, replyToAuthorUserId: 'usr_ada' }, 'usr_ada')
    ).toBe('reply');
    expect(
        messageNotificationReason({ ...channel, threadAnchorAuthorUserId: 'usr_ada' }, 'usr_ada')
    ).toBe('reply');
    expect(
        messageNotificationReason(
            { ...channel, mentionedUserIds: ['usr_ada'], replyToAuthorUserId: 'usr_ada' },
            'usr_ada'
        )
    ).toBe('mention');
    expect(messageNotificationReason({ ...channel, mentionedUserIds: ['usr_bo'] }, 'usr_ada')).toBe(
        null
    );
});

test('a human is never notified about their own message', () => {
    const own = {
        ...channel,
        authorUserId: 'usr_ada',
        mentionedUserIds: ['usr_ada'],
        replyToAuthorUserId: 'usr_ada',
        threadAnchorAuthorUserId: 'usr_ada',
    };
    expect(messageNotificationReason(own, 'usr_ada')).toBeNull();
    expect(messageNotificationReason({ ...own, conversationKind: 'dm' }, 'usr_ada')).toBeNull();
    expect(messageNotificationCandidates(own)).toEqual([]);
});

test('candidates are the named humans the rule notifies, once each', () => {
    expect(
        messageNotificationCandidates({
            ...channel,
            authorUserId: 'usr_bo',
            mentionedUserIds: ['usr_ada', 'usr_bo', 'usr_cass'],
            replyToAuthorUserId: 'usr_ada',
            threadAnchorAuthorUserId: 'usr_dee',
        })
    ).toEqual(['usr_ada', 'usr_cass', 'usr_dee']);
});
