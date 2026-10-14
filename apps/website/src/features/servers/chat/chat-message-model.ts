import type { Agent, ChatMessage, ThreadSummary } from '@haus/api';
import type { ChatMessageLayout } from '../../../hooks/servers/chat-message-layout.ts';
import type { TranscriptMessage } from '../../chats/chat-transcript-message.tsx';
import type { TranscriptActor } from '../../chats/chat-transcript-model.ts';
import type { TranscriptMessageRow } from '../../chats/transcript-contract.ts';
import { messageCloudAgentWork } from '../../cloud-agents/message-cloud-agent-work.ts';
import { messageImageGenerations } from '../../image-generation/message-image-generations.ts';

export function mergeTaskAnchor<Message extends { id: string; sequence: number }>(
    messages: readonly Message[] | undefined,
    anchor: Message | undefined
): readonly Message[] | undefined {
    if (!(messages && anchor) || messages.some((message) => message.id === anchor.id)) {
        return messages;
    }
    return [...messages, anchor].sort((left, right) => left.sequence - right.sequence);
}

export type ProjectedChatMessageRow = TranscriptMessageRow;

/** The directories a message's task fields are resolved against. */
export interface ChatMessageDirectories {
    handleByAgentId: ReadonlyMap<string, string>;
}

export function chatMessageDirectories(agents: readonly Agent[]): ChatMessageDirectories {
    return {
        handleByAgentId: new Map(agents.map((agent) => [agent.id, agent.handle])),
    };
}

export function projectChatMessages(
    messages: readonly ChatMessage[],
    threads: readonly ThreadSummary[],
    agents: readonly Agent[] = []
): ProjectedChatMessageRow[] {
    const threadsByAnchor = new Map(threads.map((thread) => [thread.anchorMessageId, thread]));
    const directories = chatMessageDirectories(agents);

    return messages.map((message) =>
        projectChatMessage(message, threadsByAnchor.get(message.id) ?? null, directories)
    );
}

export function projectChatMessage(
    message: ChatMessage,
    thread: ThreadSummary | null,
    directories: ChatMessageDirectories
): ProjectedChatMessageRow {
    const actor = messageActor(message);
    const senderType = message.author.kind === 'agent' ? ('agent' as const) : ('user' as const);
    const agentId = message.author.kind === 'agent' ? message.author.agentId : null;

    return {
        actor,
        connectsToNext: false,
        connectsToPrevious: false,
        id: message.id,
        isFirstInGroup: true,
        kind: 'message',
        message: {
            actor,
            ...(message.cause ? { cause: message.cause } : {}),
            cloudAgentWork: messageCloudAgentWork(message),
            content: message.content,
            id: message.id,
            imageGenerations: messageImageGenerations(message),
            sender: messageSender(message),
            senderType,
            sourceSessionId: null,
            sourceSessionKey: `hosted:${agentId ?? message.author.kind}`,
            hausAgentId: agentId,
            reactions: message.reactions,
            reply: message.reply,
            sendNonce: message.nonce,
            task: messageTask(message.task, directories.handleByAgentId),
            timestamp: message.createdAt,
        },
        responseId: agentId ? message.id : undefined,
        runId: message.author.kind === 'agent' ? message.runId : null,
        thread,
    };
}

function messageTask(
    task: ChatMessage['task'],
    handleByAgentId: ReadonlyMap<string, string>
): TranscriptMessage['task'] {
    if (!task) {
        return null;
    }
    return {
        assignee: taskAssignee(task, handleByAgentId),
        claimed_at: task.claimedAt,
        created_at: task.createdAt,
        labels: task.labels,
        // Tier and liveness are what the transcript's marks read: whether this
        // task has a Thread surface at all, and whether anyone is on it now.
        live: task.live,
        number: task.number,
        origin: task.origin,
        priority: task.priority,
        status: task.status,
        tier: task.tier,
        updated_at: task.updatedAt,
    };
}

function taskAssignee(
    task: NonNullable<ChatMessage['task']>,
    handleByAgentId: ReadonlyMap<string, string>
): { handle: string | null; id: string; kind: 'agent' } | null {
    if (!task.assigneeAgentId) {
        return null;
    }
    return {
        handle: handleByAgentId.get(task.assigneeAgentId) ?? null,
        id: task.assigneeAgentId,
        kind: 'agent',
    };
}

/**
 * A transcript list's skeleton row: the layout facts the row model groups by,
 * with nothing mutable and no prose. The row renders the entity it names
 * (`useEntityTranscriptEntry`), projected by `projectChatMessage`; both share
 * the actor, run, session, and send identity, so grouping and keys agree.
 */
export function projectChatMessageLayout(
    layout: ChatMessageLayout,
    attachedWork: boolean
): ProjectedChatMessageRow {
    const actor = messageActor(layout);
    const agentId = layout.author.kind === 'agent' ? layout.author.agentId : null;

    return {
        actor,
        connectsToNext: false,
        connectsToPrevious: false,
        entity: { attachedWork, chatId: layout.chatId, serverId: layout.serverId },
        id: layout.id,
        isFirstInGroup: true,
        kind: 'message',
        message: {
            actor,
            content: '',
            hausAgentId: agentId,
            id: layout.id,
            reply: layout.reply,
            sender: messageSender(layout),
            senderType: layout.author.kind === 'agent' ? 'agent' : 'user',
            sendNonce: layout.nonce,
            sourceSessionId: null,
            sourceSessionKey: `hosted:${agentId ?? layout.author.kind}`,
            timestamp: layout.createdAt,
        },
        responseId: agentId ? layout.id : undefined,
        runId: layout.author.kind === 'agent' ? layout.runId : null,
        thread: null,
    };
}

function messageSender(message: Pick<ChatMessage, 'author'>) {
    return message.author.kind === 'agent'
        ? (message.author.profile?.displayName ?? message.author.agentId)
        : (message.author.profile?.displayName ?? message.author.userId);
}

function messageActor(message: Pick<ChatMessage, 'author'>): TranscriptActor {
    return message.author.kind === 'agent'
        ? { id: message.author.agentId, kind: 'agent' }
        : { id: message.author.userId, kind: 'participant' };
}
