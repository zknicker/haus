import { ChatEventStreamProvider } from './use-chat-event-stream.tsx';
import { useChatLifecycleEvents } from './use-chat-lifecycle-events.ts';
import { useChatReadEvents } from './use-chat-read-events.ts';
import { useCloudAgentWorkEvents } from './use-cloud-agent-work-events.ts';
import { useMessageCreatedEvents } from './use-message-created-events.ts';
import { useMessageReactionEvents } from './use-message-reaction-events.ts';
import { useTaskChangeEvents } from './use-task-change-events.ts';
import { useTaskLabelEvents } from './use-task-label-events.ts';
import { useThreadFollowEvents } from './use-thread-follow-events.ts';

/**
 * Every Chat event listener on one Server, over one durable stream. Each hook
 * below owns exactly what its own event type refetches.
 */
export function ChatEventListeners({ serverId }: { serverId: string | undefined }) {
    return (
        <ChatEventStreamProvider serverId={serverId}>
            <ChatEventInvalidations />
        </ChatEventStreamProvider>
    );
}

function ChatEventInvalidations() {
    useMessageCreatedEvents();
    useMessageReactionEvents();
    useCloudAgentWorkEvents();
    useChatReadEvents();
    useChatLifecycleEvents();
    useThreadFollowEvents();
    useTaskChangeEvents();
    useTaskLabelEvents();

    // `reminder.changed` deliberately has no listener. This participant-gated
    // lane cannot see every reminder shown on an Agent profile.

    return null;
}
