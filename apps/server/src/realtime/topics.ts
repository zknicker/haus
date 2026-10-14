import {
    agentUpdatedEventSchema,
    chatLifecycleEventSchema,
    chatReadEventSchema,
    cloudAgentSettingsUpdatedEventSchema,
    cloudAgentWorkUpdatedEventSchema,
    computerUpdatedEventSchema,
    imageGenerationUpdatedEventSchema,
    invitationUpdatedEventSchema,
    mcpUpdatedEventSchema,
    memberUpdatedEventSchema,
    messageCreatedEventSchema,
    messageReactionUpdatedEventSchema,
    reminderUpdatedEventSchema,
    serverUpdatedEventSchema,
    taskChangedEventSchema,
    taskLabelUpdatedEventSchema,
    threadFollowUpdatedEventSchema,
} from '@haus/api';
import { createTopic } from './topic.ts';

/**
 * Every realtime topic the Server publishes, one per event type
 * (specs/realtime-events.md, "Subscription table"). Each has exactly one
 * subscription procedure.
 */

// Chat and Thread streams.
export const messageCreatedTopic = createTopic('message.created', messageCreatedEventSchema);
export const messageReactionUpdatedTopic = createTopic(
    'message.reaction.updated',
    messageReactionUpdatedEventSchema
);
/** Reader only: published with the reader as `audienceUserId`. */
export const chatReadTopic = createTopic('chat.read', chatReadEventSchema);
/** Reader only: published with the follower as `audienceUserId`. */
export const threadFollowUpdatedTopic = createTopic(
    'thread.follow.updated',
    threadFollowUpdatedEventSchema
);
export const chatLifecycleTopic = createTopic('chat.lifecycle', chatLifecycleEventSchema);
export const taskChangedTopic = createTopic('task.changed', taskChangedEventSchema);
export const taskLabelUpdatedTopic = createTopic('taskLabel.updated', taskLabelUpdatedEventSchema);
export const cloudAgentWorkUpdatedTopic = createTopic(
    'cloudAgentWork.updated',
    cloudAgentWorkUpdatedEventSchema
);
export const imageGenerationUpdatedTopic = createTopic(
    'imageGeneration.updated',
    imageGenerationUpdatedEventSchema
);
export const reminderUpdatedTopic = createTopic('reminder.updated', reminderUpdatedEventSchema);

// Server-level streams.
export const agentUpdatedTopic = createTopic('agent.updated', agentUpdatedEventSchema);
export const computerUpdatedTopic = createTopic('computer.updated', computerUpdatedEventSchema);
export const mcpUpdatedTopic = createTopic('mcp.updated', mcpUpdatedEventSchema);
/** Also the membership sentinel: every publish that can revoke membership sends it. */
export const serverUpdatedTopic = createTopic('server.updated', serverUpdatedEventSchema);
export const memberUpdatedTopic = createTopic('member.updated', memberUpdatedEventSchema);
export const invitationUpdatedTopic = createTopic(
    'invitation.updated',
    invitationUpdatedEventSchema
);
export const cloudAgentSettingsUpdatedTopic = createTopic(
    'cloudAgentSettings.updated',
    cloudAgentSettingsUpdatedEventSchema
);
