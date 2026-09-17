import type {
    AgentAvailability,
    Ask,
    ChatMessage,
    CloudAgentWork,
    MessageCause,
    TaskLabel,
} from '@haus/api';
import type { MessageTask, TaskOrigin } from '../tasks/task-presentation.ts';
import type { TranscriptSystemRow } from './transcript-system-row.ts';

export type { TranscriptDelivery, TranscriptSystemRow } from './transcript-system-row.ts';

export type TranscriptActor =
    | { id: string; kind: 'agent' }
    | { id: string; kind: 'participant' }
    | { id: string; kind: 'profile' }
    | null;

export interface TranscriptActiveReply {
    agentId: string;
    completedAt?: string | null;
    isThinking?: boolean;
    runId: string;
    sessionKey: string;
    startedAt: string;
    statusSequence?: number | null;
    text?: string;
    trigger?: 'evaluation';
}

interface TranscriptActorProfileBase {
    avatarUrl: string | null;
    id: string;
    isSelf: boolean;
    name: string;
}

export type TranscriptActorProfile =
    | (TranscriptActorProfileBase & {
          availability: { kind: 'live'; value: AgentAvailability };
          deleted: false;
          kind: 'agent';
      })
    | (TranscriptActorProfileBase & {
          availability: { kind: 'none' };
          deleted: boolean;
          kind: 'agent' | 'participant' | 'profile';
      });

export type TranscriptAttachment =
    | {
          dataBase64: string;
          filename: string;
          height?: number | null;
          mediaType: string;
          sizeBytes: number;
          type: 'inline';
          width?: number | null;
      }
    | {
          filename: string;
          mediaType?: string | null;
          path: string;
          sizeBytes?: number | null;
          type: 'file';
          uri?: string | null;
      };

export interface TranscriptMessageMetadata extends Record<string, unknown> {
    agentModel?: string;
    model?: string;
    provider?: string;
    runtime?: {
        messagePhase?: string;
        phase?: string;
        runId?: string;
        sessionKey?: string;
        streaming?: boolean;
    };
    stopReason?: string;
    toolCallId?: string;
    totalTokens?: number;
    usage?: unknown;
}

export interface TranscriptMessageReaction {
    actors: Array<{ handle: string | null; id: string; kind: 'agent' | 'human' }>;
    emoji: string;
}

export interface TranscriptMessage {
    actor?: TranscriptActor | null;
    /** The Ask this Message anchors, projected from its typed body. */
    ask?: Ask | null;
    attachments?: TranscriptAttachment[];
    /**
     * The automation fire this message answers. A fire writes no transcript
     * row of its own, so this is what the header mark renders from.
     */
    cause?: MessageCause | null;
    /** The Cloud Agent work this Message anchors, projected from its typed body. */
    cloudAgentWork?: CloudAgentWork | null;
    content: string;
    hausAgentId?: string | null;
    id: string;
    metadata?: TranscriptMessageMetadata;
    reactions?: TranscriptMessageReaction[];
    /** The bounded direct parent/root context for an inline reply. */
    reply?: ChatMessage['reply'];
    sender: string;
    senderType: 'agent' | 'system' | 'user';
    sourceSessionId?: string | null;
    sourceSessionKey: string;
    task?:
        | (MessageTask & {
              claimed_at: string | null;
              created_at: string;
              labels: TaskLabel[];
              origin: TaskOrigin;
              priority: 'none' | 'urgent' | 'high' | 'medium' | 'low';
              updated_at: string;
          })
        | null;
    timestamp: string;
}

export interface TranscriptThreadReplyPreview {
    authorAgentId: string | null;
    authorUserId: string | null;
    content: string;
    createdAt: string;
    id: string;
}

export interface TranscriptThreadSummary {
    anchorMessageId: string;
    followed: boolean;
    latestReplyAt: string | null;
    recentReplies?: TranscriptThreadReplyPreview[];
    replyCount: number;
    threadChatId: string;
    unreadCount: number;
}

export interface TranscriptMessageRow {
    actor: TranscriptActor;
    connectsToNext: boolean;
    connectsToPrevious: boolean;
    id: string;
    isFirstInGroup: boolean;
    kind: 'message';
    message: TranscriptMessage;
    responseId?: string;
    runId?: string | null;
    thread?: TranscriptThreadSummary | null;
}

export interface TranscriptToolCall {
    callId: string | null;
    facts: Array<{ label: string; tone: 'danger' | 'default' | 'success'; value: string }>;
    label: string | null;
    model?: { label: string; model: string; provider: string };
    name: string;
    status: string | null;
    summaryParts: string[];
}

export interface TranscriptSessionRelationship {
    direction: 'incoming' | 'outgoing';
    edgeType: 'session_spawns_session';
    id: string;
    occurredAt: string;
    relatedSession: {
        agentId: string | null;
        key: string;
        name: string;
        platform: string | null;
        source: string;
        title: string;
        type: 'chat' | 'cron' | 'link' | 'portal';
    };
    sourceToolCallId: string | null;
}

export interface TranscriptToolRow {
    actor: TranscriptActor;
    clarification?: {
        answer: string | null;
        choices: string[];
        deadlineAt: string | null;
        disposition: 'answered' | 'skipped' | 'timeout' | null;
        question: string;
        requestId: string;
    } | null;
    completedAt: string | null;
    connectsToNext: boolean;
    connectsToPrevious: boolean;
    id: string;
    isFirstInGroup: boolean;
    kind: 'tool';
    responseId?: string;
    runId?: string | null;
    sessionKey: string | null;
    spawnedRelationships: TranscriptSessionRelationship[];
    startedAt: string | null;
    toolCall: TranscriptToolCall;
}

export interface TranscriptWorker {
    agentId: string | null;
    agentName: string;
    chatTitle: string | null;
    childSessionKey: string | null;
    cleanupAfter: string | null;
    createdAt: string;
    deliveryStatus: string | null;
    description: string | null;
    detail: string | null;
    endedAt: string | null;
    error: string | null;
    executionMode: 'detached_session' | 'main_session' | 'unknown';
    id: string;
    kind: 'acp' | 'cli' | 'cron' | 'subagent';
    lastEventAt: string | null;
    notifyPolicy: string | null;
    parentWorkerId: string | null;
    progressSummary: string | null;
    requesterSessionKey: string | null;
    runId: string | null;
    sessionKey: string | null;
    source: string;
    sourceFlowId: string | null;
    sourceId: string;
    startedAt: string | null;
    status:
        | 'blocked'
        | 'cancelled'
        | 'failed'
        | 'lost'
        | 'queued'
        | 'running'
        | 'succeeded'
        | 'timed_out'
        | 'waiting';
    syncedAt: string;
    terminalSummary: string | null;
    title: string;
}

export interface TranscriptWorkerRow {
    actor: TranscriptActor;
    completedAt: string | null;
    connectsToNext: boolean;
    connectsToPrevious: boolean;
    id: string;
    isFirstInGroup: boolean;
    kind: 'worker';
    responseId?: string;
    sessionKey: string | null;
    startedAt: string | null;
    worker: TranscriptWorker;
}

export interface TranscriptWidgetRow {
    actor: TranscriptActor;
    completedAt: string | null;
    connectsToNext: boolean;
    connectsToPrevious: boolean;
    id: string;
    isFirstInGroup: boolean;
    kind: 'widget';
    responseId?: string;
    runId?: string | null;
    sessionKey: string | null;
    startedAt: string | null;
    widget: {
        component: string | null;
        fallbackText: string;
        id: string;
        props?: unknown;
        target: string | null;
        validationError: string | null;
    };
}

export type TranscriptRow =
    | TranscriptMessageRow
    | TranscriptSystemRow
    | TranscriptToolRow
    | TranscriptWidgetRow
    | TranscriptWorkerRow;
