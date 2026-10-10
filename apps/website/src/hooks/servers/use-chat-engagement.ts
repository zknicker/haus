import type { ChatEngagement, ChatEngagementEvent, ChatEngagements } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { useChatLost } from '../realtime/use-chat-lost.ts';
import { useSubscriptionRestart } from '../realtime/use-subscription-restart.ts';

const noEngagements: readonly ChatEngagement[] = [];

/**
 * The Agents engaged in one Chat — each has read a human message there and
 * not yet answered it (ADR 0035). This hook owns the whole cache: the durable
 * read is the initial and reconnect catch-up, and live events patch it exactly.
 * `onEnded` hears each end that removes a cached engagement, for transient
 * presentation only.
 */
export function useChatEngagement(
    serverId: string,
    ownChatId: string | undefined,
    onEnded?: (event: Extract<ChatEngagementEvent, { type: 'chat.engagement.ended' }>) => void
): readonly ChatEngagement[] {
    // A deleted Chat stops its stream and read; it never retries against a missing Chat.
    const chatId = useChatLost(serverId, ownChatId) ? undefined : ownChatId;
    const utils = hausTrpc.useUtils();
    const enabled = chatId !== undefined;
    const input = { chatId: chatId ?? '', serverId };
    const query = hausTrpc.chat.engagements.useQuery(input, {
        ...queryPolicy.volatileState,
        enabled,
    });

    const restart = useSubscriptionRestart(
        'chat.onEngagement',
        serverId,
        undefined,
        `${serverId}:${chatId ?? ''}`,
        chatId
    );
    const { reset } = hausTrpc.chat.onEngagement.useSubscription(input, {
        enabled: enabled && restart.open,
        onComplete: () => restart.completed(reset),
        onError: (error) => restart.failed(error, reset),
        onData: (event) => {
            const key = { chatId: event.chatId, serverId: event.serverId };
            const current = utils.chat.engagements.getData(key);
            const next = current ? applyChatEngagementEvent(current, event) : current;
            if (next === current) {
                return;
            }
            utils.chat.engagements.setData(key, next);
            if (event.type === 'chat.engagement.ended') {
                onEnded?.(event);
            }
        },
        // The stream never replays, so every (re)connect re-reads the durable state.
        onStarted: () => {
            restart.started();
            if (chatId !== undefined) {
                void utils.chat.engagements.invalidate({ chatId, serverId });
            }
        },
    });

    return query.data?.engagements ?? noEngagements;
}

/** Patches one live event into the cached list; unchanged input returns itself. */
export function applyChatEngagementEvent(
    current: ChatEngagements,
    event: ChatEngagementEvent
): ChatEngagements {
    const isEventRun = (engagement: ChatEngagement) =>
        engagement.agentId === event.agentId && engagement.runId === event.runId;
    const known = current.engagements.some(isEventRun);

    if (event.type === 'chat.engagement.started') {
        if (known) {
            return current;
        }
        return {
            engagements: [
                ...current.engagements,
                {
                    agentId: event.agentId,
                    chatId: event.chatId,
                    runId: event.runId,
                    startedAt: event.emittedAt,
                },
            ],
        };
    }

    return known
        ? { engagements: current.engagements.filter((engagement) => !isEventRun(engagement)) }
        : current;
}
