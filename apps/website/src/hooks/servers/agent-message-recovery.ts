import type { AgentLifecycleEvent } from '@haus/api';
import type { QueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import type { ChatEventUtils } from './chat-events/chat-event-invalidation.ts';

/** A sending lifecycle is emitted only after the Agent message commits. */
export async function recoverAgentMessage(
    event: AgentLifecycleEvent,
    utils: Pick<ChatEventUtils, 'chat'>,
    queryClient: QueryClient
) {
    if (event.phase !== 'sending') {
        return;
    }

    const input = { serverId: event.serverId };
    // This signal lacks the parent Chat id. Recover all mounted transcripts so
    // a first Thread reply also updates its parent's summary; hidden reads stay stale.
    await queryClient.cancelQueries({ queryKey: getQueryKey(hausTrpc.chat.messages, input) });
    await Promise.all([
        utils.chat.messages.invalidate(input),
        utils.chat.list.invalidate(input),
        utils.chat.search.invalidate(input),
    ]);
}
