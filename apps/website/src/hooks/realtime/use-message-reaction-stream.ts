import type { MessageReactionUpdatedEvent } from '@haus/api';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type TargetedReadCoalescer,
    useTargetedReadCoalescer,
} from '../../lib/targeted-read-coalescer.ts';
import { freshReactions } from '../servers/fresh-reactions.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

/**
 * `chat.onMessageReactionUpdated`: the message's entity, search (which shows
 * reactions), active Cloud Agent work, and tasks (work and task rows carry
 * their message's reactions). The message is marked live so the arriving
 * reaction stamps in.
 */
export function useMessageReactionStream(serverId: string | undefined) {
    const coalescer = useTargetedReadCoalescer();
    const stream = useSubscriptionRestart('chat.onMessageReactionUpdated', serverId, () => {
        if (serverId) {
            coalescer.recoverTranscriptLists({ serverId });
            invalidateReactionReads(coalescer, serverId);
        }
    });

    const { reset } = hausTrpc.chat.onMessageReactionUpdated.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined && stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => {
                const now = Date.now();
                freshReactions.noteLive(event.messageId, now, now);
                applyMessageReaction(coalescer, event);
            },
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

export function applyMessageReaction(
    coalescer: TargetedReadCoalescer,
    event: MessageReactionUpdatedEvent
) {
    coalescer.noteMessageAnnotated(event);
    invalidateReactionReads(coalescer, event.serverId);
}

function invalidateReactionReads(coalescer: TargetedReadCoalescer, serverId: string) {
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.chat.search, { serverId }) });
    coalescer.invalidate({
        queryKey: getQueryKey(hausTrpc.cloudAgentWork.listActive, { serverId }),
    });
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.task.list, { serverId }) });
}
