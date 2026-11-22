import {
    agentContextUpdatedEventSchema,
    agentUpdatedEventSchema,
    artifactUpdatedEventSchema,
    chatLifecycleEventSchema,
    chatReadEventSchema,
    claimChangedEventSchema,
    cloudAgentSettingsUpdatedEventSchema,
    workerUpdatedEventSchema,
    computerUpdatedEventSchema,
    desktopActivityEventSchema,
    imageGenerationUpdatedEventSchema,
    invitationUpdatedEventSchema,
    mcpUpdatedEventSchema,
    memberUpdatedEventSchema,
    messageCreatedEventSchema,
    messageReactionUpdatedEventSchema,
    modelConnectionsUpdatedEventSchema,
    projectUpdatedEventSchema,
    reminderUpdatedEventSchema,
    serverUpdatedEventSchema,
    taskAssignedEventSchema,
    taskCreatedEventSchema,
    taskFollowUpdatedEventSchema,
    taskLabelUpdatedEventSchema,
    taskUpdatedEventSchema,
} from '@haus/api';
import { createTopic } from './topic.ts';

/**
 * Every realtime topic the Server publishes, one per event type
 * (specs/realtime-events.md, "Subscription table"). Each has exactly one
 * subscription procedure.
 */

export const messageCreatedTopic = createTopic('message.created', messageCreatedEventSchema);
export const messageReactionUpdatedTopic = createTopic(
    'message.reaction.updated',
    messageReactionUpdatedEventSchema
);
/** Reader only: published with the reader as `audienceUserId`. */
export const chatReadTopic = createTopic('chat.read', chatReadEventSchema);
export const chatLifecycleTopic = createTopic('chat.lifecycle', chatLifecycleEventSchema);
export const claimChangedTopic = createTopic('claim.changed', claimChangedEventSchema);
export const taskLabelUpdatedTopic = createTopic('taskLabel.updated', taskLabelUpdatedEventSchema);
export const workerUpdatedTopic = createTopic('worker.updated', workerUpdatedEventSchema);
export const imageGenerationUpdatedTopic = createTopic(
    'imageGeneration.updated',
    imageGenerationUpdatedEventSchema
);
export const reminderUpdatedTopic = createTopic('reminder.updated', reminderUpdatedEventSchema);

// Server-level streams.
export const agentUpdatedTopic = createTopic('agent.updated', agentUpdatedEventSchema);
export const agentContextUpdatedTopic = createTopic(
    'agent.context.updated',
    agentContextUpdatedEventSchema
);
export const artifactUpdatedTopic = createTopic('artifact.updated', artifactUpdatedEventSchema);
export const computerUpdatedTopic = createTopic('computer.updated', computerUpdatedEventSchema);
/** Volatile: a Device's open `desktop` commands changed. */
export const desktopActivityTopic = createTopic(
    'computer.desktopActivity',
    desktopActivityEventSchema
);
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
export const modelConnectionsUpdatedTopic = createTopic(
    'modelConnections.updated',
    modelConnectionsUpdatedEventSchema
);

export const projectUpdatedTopic = createTopic('project.updated', projectUpdatedEventSchema);

export const taskCreatedTopic = createTopic('task.created', taskCreatedEventSchema);
export const taskUpdatedTopic = createTopic('task.updated', taskUpdatedEventSchema);
/** Server-internal: iPhone push listens; no client stream carries it. */
export const taskAssignedTopic = createTopic('task.assigned', taskAssignedEventSchema);
export const taskFollowUpdatedTopic = createTopic(
    'task.follow.updated',
    taskFollowUpdatedEventSchema
);
