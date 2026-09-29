import { beforeEach, describe, expect, test } from 'bun:test';
import type { NeedsYouRow } from '@haus/api';
import { createNeedsYouNotifier, type NotificationApi } from './needs-you-notifier.ts';

interface Shown {
    close: () => void;
    onclick: ((event: Event) => void) | null;
    options: { body: string; tag: string };
    title: string;
}

let shown: Shown[] = [];
let permission: NotificationPermission = 'granted';

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
    permission = 'granted';
});

describe('createNeedsYouNotifier', () => {
    test('rows present at first load never notify', () => {
        const notifier = setup();
        notifier.observe([row('cht_a', 'msg_1')]);
        notifier.observe([row('cht_a', 'msg_1')]);

        expect(shown).toEqual([]);
    });

    test('a new row notifies once, tagged by its Chat', () => {
        const notifier = setup();
        notifier.observe([]);
        notifier.observe([row('cht_a', 'msg_1')]);
        notifier.observe([row('cht_a', 'msg_1')]);

        expect(shown.map((item) => [item.title, item.options])).toEqual([
            ['Orbit', { body: 'preview msg_1', tag: 'cht_a' }],
        ]);
    });

    test('newer activity in a row it already had notifies again', () => {
        const notifier = setup();
        notifier.observe([row('cht_a', 'msg_1')]);
        notifier.observe([row('cht_a', 'msg_2')]);

        expect(shown.map((item) => item.options.body)).toEqual(['preview msg_2']);
    });

    test('a focused window does not notify, and does not save the row for later', () => {
        let background = false;
        const notifier = setup({ isBackground: () => background });
        notifier.observe([]);
        notifier.observe([row('cht_a', 'msg_1')]);
        background = true;
        notifier.observe([row('cht_a', 'msg_1')]);

        expect(shown).toEqual([]);
    });

    test('nothing shows with the toggle off or permission missing', () => {
        const off = setup({ isEnabled: () => false });
        off.observe([]);
        off.observe([row('cht_a', 'msg_1')]);
        permission = 'denied';
        const denied = setup();
        denied.observe([]);
        denied.observe([row('cht_b', 'msg_2')]);

        expect(shown).toEqual([]);
    });

    test('clicking a notification opens its row', () => {
        const opened: string[] = [];
        const notifier = setup({ onOpen: (item) => opened.push(item.chatId) });
        notifier.observe([]);
        notifier.observe([row('cht_a', 'msg_1')]);
        shown[0]?.onclick?.(new Event('click'));

        expect(opened).toEqual(['cht_a']);
    });
});

function setup(overrides: Partial<Parameters<typeof createNeedsYouNotifier>[0]> = {}) {
    return createNeedsYouNotifier({
        isBackground: () => true,
        isEnabled: () => true,
        notificationApi: FakeNotification as unknown as NotificationApi,
        onOpen: () => {},
        textFor: (item) => ({ body: item.latest.preview, title: 'Orbit' }),
        ...overrides,
    });
}

function row(chatId: string, messageId: string): NeedsYouRow {
    return {
        addressedCount: 1,
        chatId,
        chatKind: 'dm',
        chatPeerAgentId: 'agt_orbit',
        chatPeerUserId: null,
        conversationChatId: chatId,
        latest: {
            author: { agentId: 'agt_orbit', kind: 'agent' },
            createdAt: '2026-09-29T12:00:00.000Z',
            messageId,
            preview: `preview ${messageId}`,
            sequence: 1,
        },
        reason: 'dm',
        threadAnchorMessageId: null,
    };
}
