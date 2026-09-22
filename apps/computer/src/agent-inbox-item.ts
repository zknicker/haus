import type { ChatMessageReply, CloudAgentBranch } from '@haus/api';

export interface AgentInboxItem {
    /** This item names the Agent personally: a DM, an @mention, or a committed Jev narrow. */
    addressed?: boolean;
    addressedReason?: 'dm' | 'mention' | 'routing';
    ask?: AgentInboxAsk;
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
        assigneeUserId: string | null;
        messageId: string;
        number: number;
        priority: 'high' | 'low' | 'medium' | 'none' | 'urgent';
        status: 'closed' | 'done' | 'in_progress' | 'in_review' | 'todo';
    };
    threadFollowReactivated?: boolean;
}

/** The inbox projection of an Ask: who owes the answer, and whether it is still owed. */
export interface AgentInboxAsk {
    addresseeHandle: string | null;
    status: 'answered' | 'open';
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
