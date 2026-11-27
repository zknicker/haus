import type { AddressedReason, ChatMessageReply } from '@haus/api';

export interface AgentInboxItem {
    /** This item names the Agent personally: a DM, an @mention, a Jev routing, or a sole Agent. */
    addressed?: boolean;
    addressedReason?: AddressedReason;
    chatId: string;
    claim?: {
        assigneeAgentId: string | null;
        messageId: string;
        number: number;
        status: 'closed' | 'done' | 'in_progress' | 'in_review' | 'todo';
    };
    content: string;
    createdAt: string;
    id: string;
    mentioned?: boolean;
    message?: Record<string, unknown>;
    pullRequestNotice?: PullRequestChange;
    reply?: ChatMessageReply | null;
    senderDescription?: string;
    senderHandle: string;
    /** The human sender's saved IANA zone; absent for Agents and humans without one. */
    senderTimezone?: string;
    senderType: 'agent' | 'human' | 'system' | 'trigger';
    sequence: number;
    target: string;
}

export interface PullRequestChange {
    change: 'checks_failing' | 'checks_passing' | 'ready_for_review';
    url: string;
}
