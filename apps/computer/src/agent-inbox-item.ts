import type {
    AddressedReason,
    ChatMessageReply,
    WorkerBranch,
    CloudAgentProvider,
    WorkerStallCode,
    WorkerTurnStatus,
} from '@haus/api';

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
    worker?: AgentWorkerAttention;
    content: string;
    createdAt: string;
    id: string;
    mentioned?: boolean;
    message?: Record<string, unknown>;
    pullRequestNotice?: WorkerPullRequestChange;
    reply?: ChatMessageReply | null;
    senderDescription?: string;
    senderHandle: string;
    /** The human sender's saved IANA zone; absent for Agents and humans without one. */
    senderTimezone?: string;
    senderType: 'agent' | 'human' | 'system' | 'trigger';
    sequence: number;
    target: string;
}

/** A settled Worker Run's terminal attention for the delegating Agent. */
export interface AgentWorkerAttention {
    branches: WorkerBranch[];
    errorCode: string | null;
    /** Whether `summary` is only the capped head of a longer report (TECH-8). */
    hasFullReport?: boolean;
    notice: 'settled' | 'stall' | 'pull_request';
    provider: CloudAgentProvider;
    providerUrl: string | null;
    pullRequestChange?: WorkerPullRequestChange;
    repository: string;
    turnId: string;
    stallCode: WorkerStallCode | null;
    status: WorkerTurnStatus;
    summary: string | null;
    title: string;
    workerId: string;
}

export interface WorkerPullRequestChange {
    change: 'checks_failing' | 'checks_passing' | 'ready_for_review';
    url: string;
}
