import type { AgentTurnTrigger, ChatMessage } from '@haus/api';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { TRPCClientError } from '@trpc/client';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/** What the App could read of a turn's trigger message. */
export type TurnTriggerMessage =
    | { readonly status: 'pending' }
    | { readonly message: ChatMessage; readonly status: 'resolved' }
    | { readonly status: 'unreadable' };

/**
 * At most this many trigger reads run at once. A turn list names up to 50
 * messages, and a tRPC batch that wide wedges the Server's query pool, so the
 * reads roll through a small window instead of one burst.
 */
const readWindow = 4;

/**
 * Reads the message behind each message- or task-triggered turn through the
 * ordinary `chat.messages` read, which applies the reader's Chat access.
 * Keyed apart from transcript pages so a Chat event's prefix invalidation
 * never refetches every row at once; a trigger's text is a label, read once.
 */
export function useTurnTriggerMessages(
    serverId: string,
    triggers: readonly (AgentTurnTrigger | null)[]
): ReadonlyMap<string, TurnTriggerMessage> {
    const utils = hausTrpc.useUtils();
    const queryClient = useQueryClient();
    const refs = uniqueMessageRefs(triggers);
    let opened = 0;
    const queries = refs.map((ref) => {
        const queryKey = triggerMessageKey(serverId, ref.messageId);
        const status = queryClient.getQueryState(queryKey)?.status;
        const settled = status === 'success' || status === 'error';
        const enabled = settled || opened < readWindow;
        if (!settled && enabled) {
            opened += 1;
        }
        return {
            ...queryPolicy.syncedSnapshot,
            enabled,
            queryFn: async () => {
                try {
                    const page = await utils.client.chat.messages.query({
                        aroundMessageId: ref.messageId,
                        chatId: ref.chatId,
                        limit: 1,
                        serverId,
                    });
                    return page.messages.find((message) => message.id === ref.messageId) ?? null;
                } catch (error) {
                    // A deleted message or a Chat the reader left is a settled
                    // answer, not an error: caching it keeps a remount from
                    // re-reading every unreadable trigger at once.
                    if (isUnreadable(error)) {
                        return null;
                    }
                    throw error;
                }
            },
            queryKey,
            // Trigger text is a stable pointer, not live content: reading it
            // again on every mount would re-run the whole window.
            staleTime: Number.POSITIVE_INFINITY,
        };
    });
    const results = useQueries({ queries });

    const messages = new Map<string, TurnTriggerMessage>();
    refs.forEach((ref, index) => {
        const result = results[index];
        messages.set(
            ref.messageId,
            result?.data
                ? { message: result.data, status: 'resolved' }
                : result?.isError || result?.data === null
                  ? { status: 'unreadable' }
                  : { status: 'pending' }
        );
    });
    return messages;
}

interface MessageRef {
    readonly chatId: string;
    readonly messageId: string;
}

function uniqueMessageRefs(triggers: readonly (AgentTurnTrigger | null)[]): MessageRef[] {
    const refs = new Map<string, MessageRef>();
    for (const trigger of triggers) {
        if (trigger && (trigger.kind === 'message' || trigger.kind === 'task')) {
            refs.set(trigger.messageId, { chatId: trigger.chatId, messageId: trigger.messageId });
        }
    }
    return [...refs.values()];
}

function isUnreadable(error: unknown): boolean {
    const code = error instanceof TRPCClientError ? error.data?.code : undefined;
    return code === 'NOT_FOUND' || code === 'FORBIDDEN';
}

function triggerMessageKey(serverId: string, messageId: string) {
    return ['haus', 'agent-turn-trigger-message', serverId, messageId] as const;
}
