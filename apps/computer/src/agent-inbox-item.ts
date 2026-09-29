import type {
    AddressedReason,
    AgentThreadContext,
    ChatMessageReply,
    CloudAgentBranch,
} from '@haus/api';

export interface AgentInboxItem {
    /** This item names the Agent personally: a DM, an @mention, a Jev routing, or a sole Agent. */
    addressed?: boolean;
    addressedReason?: AddressedReason;
    chatId: string;
    cloudAgentWork?: AgentCloudAgentWorkAttention;
    content: string;
    createdAt: string;
    id: string;
    mentioned?: boolean;
    message?: Record<string, unknown>;
    reply?: ChatMessageReply | null;
    senderDescription?: string;
    senderHandle: string;
    senderType: 'agent' | 'human' | 'system' | 'trigger';
    sequence: number;
    target: string;
    task?: {
        assigneeAgentId: string | null;
        messageId: string;
        number: number;
        priority: 'high' | 'low' | 'medium' | 'none' | 'urgent';
        status: 'closed' | 'done' | 'in_progress' | 'in_review' | 'todo';
    };
    /** The Thread a mention arrived in, when the Agent has no visible context for it. */
    threadContext?: AgentThreadContext;
    threadFollowReactivated?: boolean;
}

/** A settled Cloud Agent Run's terminal attention for the delegating Agent. */
export interface AgentCloudAgentWorkAttention {
    branches: CloudAgentBranch[];
    errorCode: string | null;
    provider: 'cursor';
    providerUrl: string | null;
    repository: string;
    runId: string;
    status: 'cancelled' | 'completed' | 'expired' | 'failed' | 'queued' | 'running';
    summary: string | null;
    title: string;
    workId: string;
}
