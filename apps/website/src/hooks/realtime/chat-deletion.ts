import type { QueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';

import { hausTrpc } from '../../lib/haus-server.tsx';
import type { TargetedReadCoalescer } from '../../lib/targeted-read-coalescer.ts';
import { runChatLoss } from '../servers/server-loss.ts';

type ChatReadsCoalescer = Pick<TargetedReadCoalescer, 'invalidate' | 'purgeChat'>;

/**
 * The one App path for a Chat the Server no longer has: a `chat.onLifecycle`
 * `deleted` event and a per-Chat stream's `chat_missing` refusal both run it.
 * It purges every read of the Chat (`runChatLoss`) and refreshes the lists and
 * Agent Chat rows that still name it.
 */
export function applyChatDeletion({
    chatId,
    coalescer,
    queryClient,
    serverId,
}: {
    chatId: string;
    coalescer: ChatReadsCoalescer;
    queryClient: QueryClient;
    serverId: string;
}) {
    void runChatLoss({ chatId, coalescer, queryClient, serverId });
    invalidateChatLifecycleReads(coalescer, serverId, chatId);
    invalidateLinkedCloudAgentWork(coalescer, serverId);
}

function invalidateLinkedCloudAgentWork(coalescer: ChatReadsCoalescer, serverId: string) {
    coalescer.invalidate({
        queryKey: getQueryKey(hausTrpc.cloudAgentWork.listAutomations, { serverId }),
    });
    coalescer.invalidate({
        queryKey: getQueryKey(hausTrpc.cloudAgentWork.listActive, { serverId }),
    });
    coalescer.invalidate({
        queryKey: getQueryKey(hausTrpc.cloudAgentWork.listForChat, { serverId }),
    });
}

/** Without a Chat id (recovery), every cached `chat.get` of the Server refreshes. */
export function invalidateChatLifecycleReads(
    coalescer: Pick<TargetedReadCoalescer, 'invalidate'>,
    serverId: string,
    chatId?: string
) {
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.chat.list, { serverId }) });
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.chat.listArchived, { serverId }) });
    coalescer.invalidate({
        queryKey: getQueryKey(hausTrpc.chat.get, chatId ? { chatId, serverId } : { serverId }),
    });
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.agent.chats, { serverId }) });
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.chat.unreadPreviews, { serverId }) });
}
