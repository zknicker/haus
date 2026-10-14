import type { ImageGenerationUpdatedEvent } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type TargetedReadCoalescer,
    useTargetedReadCoalescer,
} from '../../lib/targeted-read-coalescer.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

/**
 * `imageGeneration.onUpdated`: one event per linking Message in a live Chat,
 * on every generation state change and new link. The card renders from the
 * Message's `imageGenerations` projection, so each event refreshes exactly
 * that Message's entity. Events notify; React Query owns the state.
 */
export function useImageGenerationStream(serverId: string | undefined) {
    const coalescer = useTargetedReadCoalescer();
    const stream = useSubscriptionRestart('imageGeneration.onUpdated', serverId, () => {
        if (serverId) {
            coalescer.recoverTranscriptLists({ serverId });
        }
    });

    const { reset } = hausTrpc.imageGeneration.onUpdated.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined && stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => applyImageGenerationUpdate(coalescer, event),
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

export function applyImageGenerationUpdate(
    coalescer: TargetedReadCoalescer,
    event: ImageGenerationUpdatedEvent
) {
    const { chatId, messageId, serverId } = event;
    coalescer.noteMessageAnnotated({ chatId, messageId, serverId });
}
