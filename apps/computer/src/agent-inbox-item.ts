import type {
    AddressedReason,
    ChatMessageReply,
    CloudAgentBranch,
    CloudAgentProvider,
    CloudAgentStallCode,
    CloudAgentStatus,
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
    cloudAgentWork?: AgentCloudAgentWorkAttention;
    content: string;
    createdAt: string;
    id: string;
    mentioned?: boolean;
    message?: Record<string, unknown>;
    /**
     * A pull request attached to a Task no cloud work reports to changed (ADR 0053). Never set
     * with `cloudAgentWork`, which names the change itself when a Run backs it.
     */
    pullRequestNotice?: CloudAgentPullRequestChange;
    reply?: ChatMessageReply | null;
    senderDescription?: string;
    senderHandle: string;
    /** The human sender's saved IANA zone; absent for Agents and humans without one. */
    senderTimezone?: string;
    senderType: 'agent' | 'human' | 'system' | 'trigger';
    sequence: number;
    target: string;
}

/** A settled Cloud Agent Run's terminal attention for the delegating Agent. */
export interface AgentCloudAgentWorkAttention {
    branches: CloudAgentBranch[];
    errorCode: string | null;
    /** Whether `summary` is only the capped head of a longer report (TECH-8). */
    hasFullReport?: boolean;
    /** `pull_request`: its pull request changed after the Run settled (ADR 0053). */
    notice: 'settled' | 'stall' | 'pull_request';
    provider: CloudAgentProvider;
    providerUrl: string | null;
    /**
     * What changed on a `pull_request` notice. Absent until the Server's attention carries it;
     * the notice then names the change generically and reads the URL from `branches`.
     */
    pullRequestChange?: CloudAgentPullRequestChange;
    repository: string;
    runId: string;
    stallCode: CloudAgentStallCode | null;
    status: CloudAgentStatus;
    summary: string | null;
    title: string;
    workId: string;
}

/** A pull request moment that wakes the delegating Agent after its Run settled (ADR 0053). */
export interface CloudAgentPullRequestChange {
    change: 'checks_failing' | 'checks_passing' | 'ready_for_review';
    url: string;
}
