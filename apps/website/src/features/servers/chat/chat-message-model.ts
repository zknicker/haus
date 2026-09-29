import type { Agent, ChatMessage, ThreadSummary } from '@haus/api';
import type { TranscriptMessage } from '../../chats/chat-transcript-message.tsx';
import type { TranscriptActor } from '../../chats/chat-transcript-model.ts';
import type { TranscriptMessageRow } from '../../chats/transcript-contract.ts';

export function mergeTaskAnchor(
    messages: ChatMessage[] | undefined,
    anchor: ChatMessage | undefined
) {
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
            attachments: message.attachments.map((attachment) => ({
                filename: attachment.filename,
                mediaType: attachment.mediaType,
                path: `hosted:${attachment.id}`,
                sizeBytes: attachment.sizeBytes,
                type: 'file' as const,
            })),
            ...(message.cause ? { cause: message.cause } : {}),
            cloudAgentWork: message.body.kind === 'cloud-agent-work' ? message.body.work : null,
            content: message.content,
            id: message.id,
            sender:
                message.author.kind === 'agent'
                    ? (message.author.profile?.displayName ?? message.author.agentId)
                    : (message.author.profile?.displayName ?? message.author.userId),
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

function messageActor(message: ChatMessage): TranscriptActor {
    return message.author.kind === 'agent'
        ? { id: message.author.agentId, kind: 'agent' }
        : { id: message.author.userId, kind: 'participant' };
}
