import type { Agent, Chat, ChatMessage } from '@haus/api';
import { type InfiniteData, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCQueryUtils } from '@trpc/react-query';
import { observable } from '@trpc/server/observable';
import * as React from 'react';
import { MemoryRouter } from 'react-router-dom';
import {
    MessageScroller,
    MessageScrollerProvider,
    MessageScrollerViewport,
} from '../components/chats/message-scroller.tsx';
import { DevModeProvider } from '../components/dev-mode-provider.tsx';
import { testChat } from '../features/chats/chat-fixtures.ts';
import { testAgent } from '../features/members/agent-fixtures.ts';
import { chatMessagesQueryKey } from '../hooks/servers/use-chat-messages.ts';
import { type HausOutputs, hausTrpc } from '../lib/haus-server.tsx';
import { createRenderCensus } from './render-census.tsx';

/**
 * Real React Query, tRPC, router, and scroller providers around a transcript
 * tree, for render-isolation tests: seed the cache, mount, change the cache
 * the way a realtime event's refetch would, and read the render census. The
 * transport never answers, so nothing renders except what the test changes.
 */
export const serverId = 'srv_render';
export const viewerUserId = 'usr_viewer';
export const agents: Agent[] = [
    testAgent({ displayName: 'Blippy', handle: 'blippy', id: 'agt_blippy', serverId }),
    testAgent({ displayName: 'Tiny', handle: 'tiny', id: 'agt_tiny', serverId }),
];

/**
 * The browser APIs a transcript reads beyond the fake DOM, as inert stubs.
 * Call after the fake DOM is installed; returns a restore function.
 */
export function installTranscriptBrowserStubs(): () => void {
    const scope = globalThis as Record<string, unknown>;
    const stubs: Record<string, unknown> = {
        getComputedStyle: () => ({ getPropertyValue: () => '' }),
        localStorage: memoryStorage(),
        matchMedia: () => ({
            addEventListener: () => undefined,
            addListener: () => undefined,
            matches: false,
            removeEventListener: () => undefined,
            removeListener: () => undefined,
        }),
        sessionStorage: memoryStorage(),
        SVGElement: class {},
    };
    const saved = Object.fromEntries(Object.keys(stubs).map((key) => [key, scope[key]]));
    Object.assign(scope, stubs);
    // The scroller's effects read and mark its elements; nothing here lays out.
    const element = (scope.HTMLElement as { prototype: Record<string, unknown> }).prototype;
    const elementStubs: Record<string, unknown> = {
        children: [],
        clientHeight: 0,
        getBoundingClientRect: () => ({
            bottom: 0,
            height: 0,
            left: 0,
            right: 0,
            top: 0,
            width: 0,
        }),
        querySelector: () => null,
        querySelectorAll: () => [],
        scrollHeight: 0,
        scrollTo: () => undefined,
        scrollTop: 0,
        toggleAttribute(
            this: {
                setAttribute(name: string, value: string): void;
                removeAttribute(name: string): void;
            },
            name: string,
            force?: boolean
        ) {
            if (force === false) {
                this.removeAttribute(name);
            } else {
                this.setAttribute(name, '');
            }
        },
    };
    const added = Object.keys(elementStubs).filter((key) => !(key in element));
    for (const key of added) {
        Object.defineProperty(element, key, {
            configurable: true,
            value: elementStubs[key],
            writable: true,
        });
    }
    return () => {
        Object.assign(scope, saved);
        for (const key of added) {
            delete element[key];
        }
    };
}

function memoryStorage() {
    const values = new Map<string, string>();
    return {
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value),
    };
}

export function createTranscriptHarness() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    });
    const client = hausTrpc.createClient({
        links: [() => () => observable(() => () => undefined)],
    });
    const utils = createTRPCQueryUtils({ client, queryClient });
    const { census, CensusRoot, observe } = createRenderCensus();

    utils.agent.list.setData({ serverId }, agents);
    utils.member.list.setData({ serverId }, { members: [], viewerRole: 'owner', viewerUserId });

    function Providers({ children }: { children: React.ReactNode }) {
        return (
            <CensusRoot>
                <QueryClientProvider client={queryClient}>
                    <hausTrpc.Provider client={client} queryClient={queryClient}>
                        <MemoryRouter initialEntries={['/s/render']}>
                            <DevModeProvider>
                                <MessageScrollerProvider>
                                    <MessageScroller>
                                        <MessageScrollerViewport>
                                            {children}
                                        </MessageScrollerViewport>
                                    </MessageScroller>
                                </MessageScrollerProvider>
                            </DevModeProvider>
                        </MemoryRouter>
                    </hausTrpc.Provider>
                </QueryClientProvider>
            </CensusRoot>
        );
    }

    async function mount(node: React.ReactNode) {
        const { act } = React;
        const { createRoot } = await import('react-dom/client');
        const container = document.createElement('div');
        observe(container);
        const root = createRoot(container);
        await act(async () => {
            root.render(<Providers>{node}</Providers>);
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        return { unmount: () => act(() => root.unmount()) };
    }

    /** Applies a cache change inside act and returns the renders it caused. */
    async function change(apply: () => unknown) {
        census.reset();
        await React.act(async () => {
            await apply();
            // React Query notifies observers on a zero-delay timer.
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        return census;
    }

    return {
        change,
        mount,
        queryClient,
        setChats: (chats: Chat[]) => utils.chat.list.setData({ serverId }, chats),
        setMessages: (chatId: string, messages: ChatMessage[]) =>
            queryClient.setQueryData<InfiniteData<HausOutputs['chat']['messages']>>(
                chatMessagesQueryKey(serverId, chatId),
                {
                    pageParams: [undefined],
                    pages: [
                        {
                            messages,
                            nextAfterSequence: null,
                            nextBeforeSequence: null,
                            threads: [],
                        },
                    ],
                }
            ),
        setCloudAgentWork: (chatId: string) =>
            utils.cloudAgentWork.listForChat.setData({ chatId, serverId }, []),
        utils,
    };
}

export function chat(id: string, overrides: Partial<Chat> = {}): Chat {
    return testChat({ id, name: id, serverId, ...overrides });
}

/** A fresh copy each call, the way a refetch delivers unchanged rows. */
export function message(chatId: string, sequence: number, agentId?: string): ChatMessage {
    const profile = {
        avatarUrl: null,
        deleted: false,
        description: null,
        displayName: agentId ? 'Blippy' : 'Viewer',
    };
    return {
        attachments: [],
        author: agentId
            ? { agentId, kind: 'agent', profile }
            : { kind: 'human', profile, userId: viewerUserId },
        body: { kind: 'text' },
        chatId,
        content: `Message ${sequence} in ${chatId}`,
        createdAt: new Date(Date.UTC(2026, 9, 1, 12, sequence)).toISOString(),
        id: `msg_${chatId}_${sequence}`,
        nonce: `nonce_${chatId}_${sequence}`,
        reactions: [],
        reply: null,
        runId: null,
        sequence,
        serverId,
        sessionGeneration: null,
    };
}

export function history(chatId: string, count: number): ChatMessage[] {
    return Array.from({ length: count }, (_, index) =>
        message(chatId, index + 1, index % 2 === 0 ? 'agt_blippy' : undefined)
    );
}
