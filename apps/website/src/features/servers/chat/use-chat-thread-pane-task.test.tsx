import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { ChatMessage, ThreadSummary } from '@haus/api';
import * as React from 'react';
import type { Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import {
    type DesktopTabCommands,
    DesktopTabsContext,
} from '../../../hooks/desktop-tabs/desktop-tabs-context.ts';
import { TabIdContext } from '../../../hooks/desktop-tabs/tab-presence.ts';
import { installFakeDom } from '../../../test-support/fake-dom.ts';
import { TrpcTestProvider } from '../../../test-support/trpc-test-provider.tsx';
import { type DesktopShell, DesktopShellContext } from '../../shell/use-tab-navigator.ts';
import { useChatThreadPane } from './use-chat-thread-pane.ts';
import type { ChatInitialTask } from './use-chat-thread-selection.ts';

let restoreDom: () => void;
beforeAll(() => {
    restoreDom = installFakeDom();
});
afterAll(() => restoreDom());

const summary = { anchorMessageId: 'msg_anchor', threadChatId: 'cht_thr' } as ThreadSummary;
const threadAnchor = { chatId: 'c1', id: 'msg_anchor', sequence: 4 } as ChatMessage;
const reply = { chatId: 'cht_thr', id: 'msg_reply', sequence: 2 } as ChatMessage;
/** A task an Agent claimed on a reply inside the Thread anchored on `msg_anchor`. */
const threadTask: ChatInitialTask = {
    anchor: threadAnchor,
    summary,
    taskMessage: reply,
    taskMessageId: reply.id,
    threadChatId: 'cht_thr',
};
/** A task on a top-level message, whose own Thread it opens. */
const topLevelTask: ChatInitialTask = {
    anchor: threadAnchor,
    summary,
    taskMessage: null,
    taskMessageId: threadAnchor.id,
    threadChatId: 'cht_thr',
};

let selection: ReturnType<typeof useChatThreadPane>['selection'] = null;

function Probe({ initialTask }: { initialTask: ChatInitialTask | undefined }) {
    selection = useChatThreadPane({
        chatId: 'c1',
        initialTask,
        ready: true,
        revealMessage: () => {},
        serverId: 'server_one',
    }).selection;
    return null;
}

test('website: a Thread task opens the Thread it sits in, carrying the task message', async () => {
    await render(<Probe initialTask={threadTask} />, '/s/acme/chats/c1?task=msg_reply', null);

    expect(selection?.anchor.id).toBe('msg_anchor');
    expect(selection?.initialThreadChatId).toBe('cht_thr');
    expect(selection?.taskMessage?.id).toBe('msg_reply');
});

test('website: a top-level task still opens its own Thread', async () => {
    await render(<Probe initialTask={topLevelTask} />, '/s/acme/chats/c1?task=msg_anchor', null);

    expect(selection?.anchor.id).toBe('msg_anchor');
    expect(selection?.taskMessage).toBeNull();
});

test('desktop: a ?task= link to a Thread task opens the Thread it sits in, on that task', async () => {
    const calls: unknown[][] = [];
    await render(<Probe initialTask={threadTask} />, '/s/acme/chats/c1?task=msg_reply', calls);

    expect(calls).toEqual([
        ['open', 't0', { kind: 'app', path: '/s/acme/threads/c1/msg_anchor?task=msg_reply' }],
    ]);
});

test('desktop: a ?task= link to a top-level task opens its own Thread plainly', async () => {
    const calls: unknown[][] = [];
    await render(<Probe initialTask={topLevelTask} />, '/s/acme/chats/c1?task=msg_anchor', calls);

    expect(calls).toEqual([['open', 't0', { kind: 'app', path: '/s/acme/threads/c1/msg_anchor' }]]);
});

test('desktop: a ?task= link waits for its task’s Thread before opening anything', async () => {
    const calls: unknown[][] = [];
    await render(<Probe initialTask={undefined} />, '/s/acme/chats/c1?task=msg_reply', calls);

    expect(calls).toEqual([]);
});

/** Renders the probe on the website (`calls` null) or in a desktop tab recording its Opens. */
async function render(node: React.ReactNode, entry: string, calls: unknown[][] | null) {
    const { act } = React;
    const { createRoot } = await import('react-dom/client');
    selection = null;
    const routed = <MemoryRouter initialEntries={[entry]}>{node}</MemoryRouter>;
    const tabs = {
        open: (...args: unknown[]) => calls?.push(['open', ...args]),
        openTab: (...args: unknown[]) => calls?.push(['openTab', ...args]),
    } as unknown as DesktopTabCommands;
    const shell = {
        server: { slug: 'acme' },
        windowNavigate: () => undefined,
    } as unknown as DesktopShell;
    let root: Root | null = null;
    await act(() => {
        root = createRoot(document.createElement('div'));
        root.render(
            <TrpcTestProvider>
                {calls ? (
                    <DesktopShellContext value={shell}>
                        <DesktopTabsContext value={tabs}>
                            <TabIdContext value="t0">{routed}</TabIdContext>
                        </DesktopTabsContext>
                    </DesktopShellContext>
                ) : (
                    routed
                )}
            </TrpcTestProvider>
        );
    });
    await act(() => (root as Root | null)?.unmount());
}
