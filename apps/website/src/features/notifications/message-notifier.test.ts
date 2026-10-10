import { beforeEach, expect, test } from 'bun:test';
import type { MessageCreatedEvent } from '@haus/api';
import { createMessageNotifier, type NotificationApi } from './message-notifier.ts';

interface Shown {
    close: () => void;
    onclick: ((event: Event) => void) | null;
    options: { body: string; tag: string };
    title: string;
}

let shown: Shown[] = [];
let permission: NotificationPermission = 'granted';
let background = true;
let enabled = true;
let described: string[] = [];
let opened: string[] = [];

class FakeNotification {
    static get permission() {
        return permission;
    }
    onclick: ((event: Event) => void) | null = null;
    options: { body: string; tag: string };
    title: string;
    constructor(title: string, options: { body: string; tag: string }) {
        this.title = title;
        this.options = options;
        shown.push(this);
    }
    close() {}
}

beforeEach(() => {
    shown = [];
    described = [];
    opened = [];
    permission = 'granted';
    background = true;
    enabled = true;
});

function messageEvent(
    sequence: number,
    chatId: string,
    parentChatId: string | null = null,
    facts: Partial<
        Pick<
            MessageCreatedEvent,
            | 'authorUserId'
            | 'conversationKind'
            | 'mentionedUserIds'
            | 'replyToAuthorUserId'
            | 'threadAnchorAuthorUserId'
        >
    > = {}
): MessageCreatedEvent {
    return {
        authorUserId: facts.authorUserId ?? null,
        chatId,
        conversationKind: facts.conversationKind ?? 'channel',
        mentionedUserIds: facts.mentionedUserIds ?? [],
        messageId: `message_${sequence}`,
        parentChatId,
        replyToAuthorUserId: facts.replyToAuthorUserId ?? null,
        sequence,
        serverId: 'server_one',
        threadAnchorAuthorUserId: facts.threadAnchorAuthorUserId ?? null,
        threadAnchorMessageId: parentChatId ? 'message_anchor' : null,
    };
}

const dm = (sequence: number) => messageEvent(sequence, 'cht_dm', null, { conversationKind: 'dm' });

function notifier() {
    return createMessageNotifier({
        describe: async (event, reason) => {
            described.push(event.messageId);
            return { body: `body ${event.messageId}`, path: `/open/${reason}`, title: 'Orbit' };
        },
        isBackground: () => background,
        isEnabled: () => enabled,
        notificationApi: FakeNotification as unknown as NotificationApi,
        onOpen: (path) => opened.push(path),
        viewerUserId: () => 'usr_ada',
    });
}

test('every DM message notifies, tagged by its Chat so newer ones replace older', async () => {
    const subject = notifier();
    await subject.messageCreated(dm(1));
    await subject.messageCreated(dm(2));
    expect(shown.map((item) => [item.title, item.options])).toEqual([
        ['Orbit', { body: 'body message_1', tag: 'cht_dm' }],
        ['Orbit', { body: 'body message_2', tag: 'cht_dm' }],
    ]);
    shown[0]?.onclick?.(new Event('click'));
    expect(opened).toEqual(['/open/dm']);
});

test('a Channel message notifies only for a mention, a reply, or a Thread on my message', async () => {
    const subject = notifier();
    for (const event of [
        messageEvent(1, 'cht_product'),
        messageEvent(2, 'cht_product', null, { mentionedUserIds: ['usr_bo'] }),
        messageEvent(3, 'cht_product', null, { mentionedUserIds: ['usr_ada'] }),
        messageEvent(4, 'cht_product', null, { replyToAuthorUserId: 'usr_ada' }),
        messageEvent(5, 'cht_thread', 'cht_product', { threadAnchorAuthorUserId: 'usr_ada' }),
    ]) {
        await subject.messageCreated(event);
    }
    expect(described).toEqual(['message_3', 'message_4', 'message_5']);
});

test('my own messages never notify', async () => {
    const subject = notifier();
    await subject.messageCreated(
        messageEvent(1, 'cht_dm', null, { authorUserId: 'usr_ada', conversationKind: 'dm' })
    );
    await subject.messageCreated(
        messageEvent(2, 'cht_product', null, {
            authorUserId: 'usr_ada',
            mentionedUserIds: ['usr_ada'],
        })
    );
    expect(shown).toEqual([]);
});

test('nothing is read or shown while Haus is in view, off, or not permitted', async () => {
    const subject = notifier();
    background = false;
    await subject.messageCreated(dm(1));
    background = true;
    enabled = false;
    await subject.messageCreated(dm(2));
    enabled = true;
    permission = 'denied';
    await subject.messageCreated(dm(3));
    expect(described).toEqual([]);
    expect(shown).toEqual([]);
});

test('a duplicated live event notifies once', async () => {
    const subject = notifier();
    await subject.messageCreated(dm(1));
    await subject.messageCreated(dm(1));
    expect(shown).toHaveLength(1);
});

test('a message its Chat has been read through never notifies', async () => {
    const subject = notifier();
    subject.chatRead({ chatId: 'cht_dm', sequence: 5 });
    await subject.messageCreated(dm(4));
    await subject.messageCreated(dm(5));
    // A read of another Chat, or through an older sequence, does not cover a newer message.
    subject.chatRead({ chatId: 'cht_other', sequence: 9 });
    subject.chatRead({ chatId: 'cht_dm', sequence: 3 });
    await subject.messageCreated(dm(7));
    expect(described).toEqual(['message_7']);
    expect(shown).toHaveLength(1);
});

test('a read arriving while the message text is fetched cancels its notification', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    const subject = createMessageNotifier({
        describe: async () => {
            await gate;
            return { body: 'body', path: '/open', title: 'Orbit' };
        },
        isBackground: () => true,
        isEnabled: () => true,
        notificationApi: FakeNotification as unknown as NotificationApi,
        onOpen: () => {},
        viewerUserId: () => 'usr_ada',
    });
    const pending = subject.messageCreated(dm(3));
    subject.chatRead({ chatId: 'cht_dm', sequence: 3 });
    release();
    await pending;
    expect(shown).toEqual([]);
});
