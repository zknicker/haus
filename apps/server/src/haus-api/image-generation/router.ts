import { canSeeChat } from '../../realtime/chat-visibility.ts';
import { realtimeSubscription } from '../../realtime/subscription.ts';
import { imageGenerationUpdatedTopic } from '../../realtime/topics.ts';
import { createRouter } from '../trpc.ts';

/**
 * Humans only hear about image generations; Agents create them through the
 * Agent API. The event names the linking Message, whose `chat.message` entry
 * the App invalidates.
 */
export const imageGenerationRouter = createRouter({
    onUpdated: realtimeSubscription({
        deliver: canSeeChat,
        topic: imageGenerationUpdatedTopic,
    }),
});
