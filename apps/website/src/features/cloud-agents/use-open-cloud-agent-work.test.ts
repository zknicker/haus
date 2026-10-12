import { expect, test } from 'bun:test';
import { tabIntentState } from '../../hooks/desktop-tabs/tab-navigation.ts';
import { trackOpenGestures } from '../../hooks/desktop-tabs/tab-open-gesture.ts';
import { createCloudAgentWorkOpener } from './use-open-cloud-agent-work.ts';

/** A desktop window tracking gestures, and a way to press with one in flight. */
function window() {
    const listeners = new Map<string, (event: Event) => void>();
    const uninstall = trackOpenGestures({
        addEventListener: (type: string, listener: (event: Event) => void) =>
            listeners.set(type, listener),
        removeEventListener: (type: string) => listeners.delete(type),
    } as unknown as Window);
    const middleClick = (press: () => void) => {
        listeners.get('auxclick')?.({
            button: 1,
            ctrlKey: false,
            isTrusted: true,
            metaKey: false,
            shiftKey: false,
            type: 'auxclick',
        } as unknown as Event);
        press();
    };
    return { middleClick, uninstall };
}

test('a middle-click survives the fetch before a Thread or a Message opens', async () => {
    const calls: unknown[][] = [];
    const settle = () => new Promise((resolve) => setTimeout(resolve, 5));
    const open = createCloudAgentWorkOpener({
        fail: (title) => calls.push(['fail', title]),
        fetchMessageSequence: async () => {
            await settle();
            return 7;
        },
        fetchThread: async () => {
            await settle();
            return { anchorMessageId: 'm1', parentChatId: 'c1' };
        },
        navigate: (...args) => calls.push(['navigate', ...args]),
        openThread: (...args) => calls.push(['openThread', ...args]),
        openWork: (...args) => calls.push(['openWork', ...args]),
        slug: 'acme',
    });
    const { middleClick, uninstall } = window();
    middleClick(() =>
        open({
            id: 'w1',
            location: { chatId: 'c1', kind: 'message', messageId: 'm2', threadChatId: 't1' },
        })
    );
    middleClick(() =>
        open({
            id: 'w2',
            location: { chatId: 'c2', kind: 'message', messageId: 'm3', threadChatId: null },
        })
    );
    // The gesture's dispatch is long over by the time the fetches land.
    await settle();
    await settle();
    uninstall();
    expect(calls).toEqual([
        ['openThread', 'c1', 'm1', 'backgroundTab'],
        ['navigate', '/s/acme/chats/c2', { state: tabIntentState('backgroundTab') }],
    ]);
});
