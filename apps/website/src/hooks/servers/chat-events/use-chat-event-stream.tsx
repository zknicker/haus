import type { ServerDurableEvent } from '@haus/api';
import * as React from 'react';
import { hausTrpc } from '../../../lib/haus-server.tsx';
import {
    chatEventBatchWindowMs,
    createChatEventBatch,
    laterEventCursor,
    walkEventCatchUp,
} from './chat-event-cursor.ts';
import {
    type ChatEventHandler,
    type ChatEventRegistry,
    type ChatEventType,
    createChatEventRegistry,
} from './chat-event-registry.ts';

const ChatEventStreamContext = React.createContext<ChatEventRegistry | null>(null);

/**
 * The Chat event transport: one durable subscription, one monotonic cursor, one
 * burst window, and reconnect catch-up. It owns no invalidation mapping — each
 * listener registered through {@link useChatEvent} owns what its own event type
 * refetches.
 *
 * The cold-start snapshot lives here because it predates knowing any event: a
 * first subscription seeds its cursor from the event head and refetches the
 * Server Chat snapshot outright.
 */
export function ChatEventStreamProvider({
    children,
    serverId,
}: {
    children: React.ReactNode;
    serverId: string | undefined;
}) {
    const utils = hausTrpc.useUtils();
    const registryRef = React.useRef<ChatEventRegistry | null>(null);
    registryRef.current ??= createChatEventRegistry();
    const registry = registryRef.current;
    const eventStateRef = React.useRef({ cursor: '0', serverId });
    const batchRef = React.useRef(createChatEventBatch());
    const batchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    if (eventStateRef.current.serverId !== serverId) {
        eventStateRef.current = { cursor: '0', serverId };
    }

    const dispatchEvents = React.useCallback(
        async (events: ServerDurableEvent[]) => {
            if (serverId === undefined) {
                return;
            }

            await registry.dispatch(events, serverId);
        },
        [registry, serverId]
    );

    const flushEventBatch = React.useCallback(() => {
        if (batchTimerRef.current !== null) {
            clearTimeout(batchTimerRef.current);
            batchTimerRef.current = null;
        }

        const events = batchRef.current.drain();
        if (events) {
            void dispatchEvents(events);
        }
    }, [dispatchEvents]);

    const refetchServerChatSnapshot = React.useCallback(async () => {
        if (serverId === undefined) {
            return;
        }

        await Promise.all([
            utils.chat.list.invalidate({ serverId }),
            utils.chat.listArchived.invalidate({ serverId }),
            utils.chat.get.invalidate({ serverId }),
            utils.chat.messages.invalidate({ serverId }),
            utils.chat.search.invalidate({ serverId }),
            utils.cloudAgentWork.listActive.invalidate({ serverId }),
            utils.cloudAgentWork.listForChat.invalidate({ serverId }),
            utils.inbox.needsYou.invalidate({ serverId }),
            utils.task.list.invalidate({ serverId }, { refetchType: 'all' }),
            utils.taskLabel.list.invalidate({ serverId }, { refetchType: 'all' }),
        ]);
        // The utils proxy root is stable; each `utils.chat.x` access is a fresh
        // object, so depending on paths would rebuild this every render.
    }, [serverId, utils]);

    const catchUp = React.useCallback(async () => {
        if (serverId === undefined) {
            return;
        }

        const current = eventStateRef.current;

        if (current.serverId !== serverId) {
            return;
        }

        if (current.cursor === '0') {
            const head = await utils.chat.eventHead.fetch({ serverId });
            eventStateRef.current.cursor = laterEventCursor(
                eventStateRef.current.cursor,
                head.cursor
            );
            await refetchServerChatSnapshot();
            return;
        }

        const walkedCursor = await walkEventCatchUp({
            afterCursor: current.cursor,
            fetchPage: async (afterCursor, limit) =>
                await utils.chat.events.fetch({ afterCursor, limit, serverId }),
            onEvents: dispatchEvents,
        });

        if (eventStateRef.current.serverId === serverId) {
            eventStateRef.current.cursor = laterEventCursor(
                eventStateRef.current.cursor,
                walkedCursor
            );
        }
    }, [dispatchEvents, refetchServerChatSnapshot, serverId, utils]);

    // A pending burst belongs to the Server it arrived on, so leaving that
    // Server — or the app — flushes it instead of dropping it.
    React.useEffect(() => flushEventBatch, [flushEventBatch]);

    hausTrpc.chat.onEvent.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined,
            onData: (event) => {
                if (eventStateRef.current.serverId === serverId) {
                    eventStateRef.current.cursor = laterEventCursor(
                        eventStateRef.current.cursor,
                        event.cursor
                    );
                }
                if (batchRef.current.add(event)) {
                    batchTimerRef.current = setTimeout(flushEventBatch, chatEventBatchWindowMs);
                }
            },
            onStarted: () => void catchUp(),
        }
    );

    return (
        <ChatEventStreamContext.Provider value={registry}>
            {children}
        </ChatEventStreamContext.Provider>
    );
}

/**
 * Registers this listener for one Chat event type — or for the few types one
 * lane owns together, which then arrive in a single call. The handler is read
 * through a ref, so registration happens once per mount and a re-render never
 * churns the registry.
 */
export function useChatEvent<Type extends ChatEventType>(
    types: Type | readonly Type[],
    handler: ChatEventHandler<Type>
) {
    const registry = React.useContext(ChatEventStreamContext);

    if (!registry) {
        throw new Error('useChatEvent must be used within ChatEventStreamProvider.');
    }

    const handlerRef = React.useRef(handler);

    React.useEffect(() => {
        handlerRef.current = handler;
    });

    // The joined key is what keeps an inline type array from re-registering
    // every render; the split restores the same types the caller asked for.
    const typeKey = typeof types === 'string' ? types : [...types].join(' ');

    React.useEffect(
        () =>
            registry.register(typeKey.split(' ') as Type[], (events, eventServerId) =>
                handlerRef.current(events, eventServerId)
            ),
        [registry, typeKey]
    );
}
