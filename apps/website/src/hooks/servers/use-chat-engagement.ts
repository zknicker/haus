import type { ChatEngagement, ChatEngagementEvent, ChatEngagements } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

const noEngagements: readonly ChatEngagement[] = [];

/**
 * The Agents engaged in one Chat — each has read a human message there and
 * not yet answered it (ADR 0035). This hook owns the whole cache: the durable
 * read is the initial and reconnect catch-up, and live events patch it exactly.
 */
export function useChatEngagement(
    serverId: string,
    chatId: string | undefined
): readonly ChatEngagement[] {
    const utils = hausTrpc.useUtils();
    const enabled = chatId !== undefined;
    const input = { chatId: chatId ?? '', serverId };
    const query = hausTrpc.chat.engagements.useQuery(input, {
        ...queryPolicy.volatileState,
        enabled,
    });

    hausTrpc.chat.onEngagement.useSubscription(input, {
        enabled,
        onData: (event) => {
            utils.chat.engagements.setData(
                { chatId: event.chatId, serverId: event.serverId },
                (current) => (current ? applyChatEngagementEvent(current, event) : current)
            );
        },
        // The stream never replays, so every (re)connect re-reads the durable state.
        onStarted: () => {
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
