import { afterAll, beforeAll, expect, test } from 'bun:test';
import { installKeptChatViewTestDom } from '../../test-support/kept-chat-views-harness.tsx';
import {
    chat,
    createTranscriptHarness,
    installTranscriptBrowserStubs,
} from '../../test-support/transcript-render-harness.tsx';
import { CapyHomePage } from './home-page.tsx';

installKeptChatViewTestDom();
let restoreStubs: () => void;
const scope = globalThis as Record<string, unknown>;
const observers = ['MutationObserver', 'ResizeObserver'] as const;
const savedObservers = observers.map((name) => scope[name]);
beforeAll(() => {
    restoreStubs = installTranscriptBrowserStubs();
    for (const name of observers) {
        scope[name] = class {
            disconnect() {}
            observe() {}
            unobserve() {}
        };
    }
});
afterAll(() => {
    restoreStubs();
    observers.forEach((name, index) => {
        scope[name] = savedObservers[index];
    });
});

const project = () => chat('cht_eng', { participantAgentIds: ['agt_blippy'] });
const person = (unreadCount: number) =>
    chat('cht_dm_pat', { kind: 'dm', name: null, peerUserId: 'usr_pat', unreadCount });

test('a message anywhere on the Server leaves Home and its composer unrendered', async () => {
    const harness = createTranscriptHarness();
    harness.setChats([project(), person(0)]);
    const view = await harness.mount(
        <CapyHomePage canManage={false} serverId="srv_render" slug="render" />
    );
    expect(view.container.textContent).toContain('cht_eng');

    const census = await harness.change(() => {
        harness.setChats([
            chat('cht_eng', {
                lastActivityAt: '2026-11-19T12:00:00.000Z',
                participantAgentIds: ['agt_blippy'],
                unreadCount: 3,
            }),
            person(2),
        ]);
    });

    expect(census.count('CapyHomePage')).toBe(0);
    expect(census.count('HomeComposer')).toBe(0);

    await view.unmount();
});
