import { beforeEach, expect, test } from 'bun:test';
import { messageEvent, readEvent } from '../../hooks/servers/chat-events/chat-event-fixtures.ts';
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
    await subject.observe(
        [
            messageEvent('1', 'cht_dm', null, { conversationKind: 'dm' }),
            messageEvent('2', 'cht_dm', null, { conversationKind: 'dm' }),
        ],
        'live'
    );
    expect(shown.map((item) => [item.title, item.options])).toEqual([
        ['Orbit', { body: 'body message_1', tag: 'cht_dm' }],
        ['Orbit', { body: 'body message_2', tag: 'cht_dm' }],
    ]);
    shown[0]?.onclick?.(new Event('click'));
    expect(opened).toEqual(['/open/dm']);
});

test('a Channel message notifies only for a mention, a reply, or a Thread on my message', async () => {
    const subject = notifier();
    await subject.observe(
        [
            messageEvent('1', 'cht_product'),
            messageEvent('2', 'cht_product', null, { mentionedUserIds: ['usr_bo'] }),
            messageEvent('3', 'cht_product', null, { mentionedUserIds: ['usr_ada'] }),
            messageEvent('4', 'cht_product', null, { replyToAuthorUserId: 'usr_ada' }),
            messageEvent('5', 'cht_thread', 'cht_product', { threadAnchorAuthorUserId: 'usr_ada' }),
        ],
        'live'
    );
    expect(described).toEqual(['message_3', 'message_4', 'message_5']);
});

test('my own messages never notify', async () => {
    await notifier().observe(
        [
            messageEvent('1', 'cht_dm', null, { authorUserId: 'usr_ada', conversationKind: 'dm' }),
            messageEvent('2', 'cht_product', null, {
                authorUserId: 'usr_ada',
                mentionedUserIds: ['usr_ada'],
            }),
        ],
        'live'
    );
    expect(shown).toEqual([]);
});

test('nothing is read or shown while Haus is in view, off, or not permitted', async () => {
    const subject = notifier();
    const dm = (cursor: string) => messageEvent(cursor, 'cht_dm', null, { conversationKind: 'dm' });
    background = false;
    await subject.observe([dm('1')], 'live');
    background = true;
    enabled = false;
    await subject.observe([dm('2')], 'live');
    enabled = true;
    permission = 'denied';
    await subject.observe([dm('3')], 'live');
    expect(described).toEqual([]);
    expect(shown).toEqual([]);
});

test('a replayed message notifies once', async () => {
    const subject = notifier();
    const dm = messageEvent('1', 'cht_dm', null, { conversationKind: 'dm' });
    await subject.observe([dm], 'live');
    await subject.observe([dm], 'live');
    expect(shown).toHaveLength(1);
});

test('a reconnect catch-up replay never notifies, and its messages stay silent if replayed live', async () => {
    const subject = notifier();
    const dm = messageEvent('1', 'cht_dm', null, { conversationKind: 'dm' });
    await subject.observe(
        [dm, messageEvent('2', 'cht_product', null, { mentionedUserIds: ['usr_ada'] })],
        'catch-up'
    );
    await subject.observe([dm], 'live');
    expect(described).toEqual([]);
    expect(shown).toEqual([]);
});

test('a message its Chat has been read through never notifies', async () => {
    const subject = notifier();
    const dm = (cursor: string) => messageEvent(cursor, 'cht_dm', null, { conversationKind: 'dm' });
    // A read seen earlier, even in a catch-up pass, covers later-arriving older messages.
    await subject.observe([readEvent('10', 'cht_dm', 5)], 'catch-up');
    await subject.observe([dm('4'), dm('5')], 'live');
    // A read later in the same pass covers the message before it.
    await subject.observe([dm('6'), readEvent('11', 'cht_dm', 6)], 'live');
    // A read of another Chat, or through an older sequence, does not.
    await subject.observe(
        [dm('7'), readEvent('12', 'cht_other', 9), readEvent('13', 'cht_dm', 6)],
        'live'
    );
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
    const pending = subject.observe(
        [messageEvent('3', 'cht_dm', null, { conversationKind: 'dm' })],
        'live'
    );
    await subject.observe([readEvent('4', 'cht_dm', 3)], 'live');
    release();
    await pending;
    expect(shown).toEqual([]);
});
