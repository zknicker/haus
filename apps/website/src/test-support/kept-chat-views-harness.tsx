import { afterAll, beforeAll } from 'bun:test';
import * as React from 'react';
import type { Root } from 'react-dom/client';
import { KeptChatViews } from '../features/servers/chat/kept-chat-views.tsx';
import { installFakeDom } from './fake-dom.ts';

/**
 * Fake DOM plus synchronous animation frames for kept chat view tests, so
 * reveal-time work scheduled in a frame lands inside act(). Call at module top.
 */
export function installKeptChatViewTestDom() {
    let restoreDom: () => void = () => undefined;
    const scope = globalThis as Record<string, unknown>;
    const savedFrame = scope.requestAnimationFrame;
    beforeAll(() => {
        restoreDom = installFakeDom();
        scope.requestAnimationFrame = (callback: FrameRequestCallback) => {
            callback(0);
            return 0;
        };
        scope.cancelAnimationFrame = () => undefined;
    });
    afterAll(() => {
        scope.requestAnimationFrame = savedFrame;
        restoreDom();
    });
}

/** Renders `KeptChatViews` for whichever chat `show` names; children come from `renderChat`. */
export async function mountKept(
    renderChat: (id: string, active: boolean) => React.ReactNode,
    Wrapper: React.ComponentType<{ children: React.ReactNode }> = React.Fragment
) {
    const { act } = React;
    const { createRoot } = await import('react-dom/client');
    const container = document.createElement('div');
    let root: Root | null = null;
    const show = (chatId: string) =>
        act(() => {
            root ??= createRoot(container);
            root.render(
                <Wrapper>
                    <KeptChatViews chatId={chatId} renderChat={renderChat} serverId="s" />
                </Wrapper>
            );
        });
    const unmount = () => act(() => root?.unmount());
    return { container, show, unmount };
}
