import type { AgentTurnOperationCategory, AgentTurnTrigger, Chat } from '@haus/api';
import type { TurnTriggerMessage } from '../../../hooks/members/use-turn-trigger-messages.ts';
import { messagePreviewLine } from '../../chats/message-preview-line.ts';
import { chatPlace } from '../../shell/tab-identity.ts';
import { formatAgentActivityEvent } from './agent-activity-model.ts';
import type { AgentActivityTurn } from './agent-activity-turns.ts';
import type { RecentActivityRow } from './recent-activity-rows.ts';

/**
 * What a turn row is titled by: the request that woke it. `pending` holds the
 * title line blank while the message reads; `none` means there is nothing the
 * reader may see (private, unrecorded, or unreadable), so the outcome is the row.
 */
export type TurnRowTitle =
    | { readonly kind: 'none' }
    | { readonly kind: 'pending'; readonly place: string | null }
    | { readonly kind: 'text'; readonly place: string | null; readonly text: string };

export function resolveTurnRowTitle(
    trigger: AgentTurnTrigger | null,
    messages: ReadonlyMap<string, TurnTriggerMessage>,
    chats: ReadonlyMap<string, Pick<Chat, 'kind' | 'name'>>
): TurnRowTitle {
    if (!trigger || trigger.kind === 'private') {
        return { kind: 'none' };
    }
    const chat = chats.get(trigger.chatId);
    const place = chat ? chatPlace(chat) : null;
    if (trigger.kind === 'message' || trigger.kind === 'task') {
        const read = messages.get(trigger.messageId) ?? { status: 'pending' };
        if (read.status === 'pending') {
            return { kind: 'pending', place };
        }
        if (read.status === 'unreadable') {
            return { kind: 'none' };
        }
        const text =
            messagePreviewLine(read.message.content) ||
            (read.message.attachments.length > 0 ? 'Attachment' : '');
        return text ? { kind: 'text', place, text } : { kind: 'none' };
    }
    return { kind: 'text', place, text: workTitles[trigger.kind] };
}

/** The actions a turn took, most telling first: `2 sub-agents · 3 file edits · 1 message`. */
export function formatTurnOutcome(turn: AgentActivityTurn): string {
    const operations = [...turn.operations]
        .sort(
            (left, right) =>
                outcomeOrder.indexOf(left.category) - outcomeOrder.indexOf(right.category)
        )
        .map((operation) => {
            const total = operation.completed + operation.failed + operation.interrupted;
            const noun = outcomeNouns[operation.category][total === 1 ? 0 : 1];
            const exceptions = [
                operation.failed > 0 ? `${operation.failed} failed` : null,
                operation.interrupted > 0 ? `${operation.interrupted} interrupted` : null,
            ].filter(Boolean);
            return `${total} ${noun}${exceptions.length > 0 ? ` (${exceptions.join(', ')})` : ''}`;
        });
    const parts = [
        // The row's status mark already says "Failed"; only a known reason adds anything.
        ...(turn.kind === 'settled' && turn.status === 'failed' && turn.failureKind
            ? [failureReasons[turn.failureKind]].filter(Boolean)
            : []),
        ...operations,
        ...(turn.messageCount > 0
            ? [`${turn.messageCount} ${turn.messageCount === 1 ? 'message' : 'messages'}`]
            : []),
    ];
    if (parts.length > 0) {
        return parts.join(' · ');
    }
    if (turn.kind === 'active') {
        // Nothing has settled yet: say what the Agent is doing right now.
        const latest = turn.events.at(-1);
        return latest ? formatAgentActivityEvent(latest) : 'Starting…';
    }
    return 'No actions';
}

/** Status only when it is news: a completed turn says nothing. */
export type TurnRowStatus =
    | { readonly kind: 'failed' | 'interrupted'; readonly count: number }
    | { readonly kind: 'working' }
    | null;

export function getTurnRowStatus(row: RecentActivityRow): TurnRowStatus {
    const turn = row.latest;
    if (turn.kind === 'active') {
        return { kind: 'working' };
    }
    return turn.status === 'completed' ? null : { count: row.count, kind: turn.status };
}

export interface TurnDayGroup {
    readonly key: string;
    readonly label: string;
    readonly rows: readonly RecentActivityRow[];
}

/** Rows (newest first) under `Today`, `Yesterday`, then `Oct 4` headers. */
export function groupTurnRowsByDay(
    rows: readonly RecentActivityRow[],
    now = Date.now()
): TurnDayGroup[] {
    const groups: { key: string; label: string; rows: RecentActivityRow[] }[] = [];
    for (const row of rows) {
        const date = new Date(row.latest.startedAt);
        const key = localDayKey(date);
        const last = groups.at(-1);
        if (last?.key === key) {
            last.rows.push(row);
        } else {
            groups.push({ key, label: formatDayLabel(date, now), rows: [row] });
        }
    }
    return groups;
}

/** A turn's length for a right-aligned column: `42s`, `3m 05s`, `1h 02m`. */
export function formatTurnDuration(durationMs: number): string {
    const seconds = Math.max(0, Math.round(durationMs / 1000));
    if (seconds < 60) {
        return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
        return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
    }
    return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

function localDayKey(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatDayLabel(date: Date, now: number): string {
    const today = new Date(now);
    if (localDayKey(date) === localDayKey(today)) {
        return 'Today';
    }
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    if (localDayKey(date) === localDayKey(yesterday)) {
        return 'Yesterday';
    }
    return date.toLocaleDateString([], {
        day: 'numeric',
        month: 'short',
        ...(date.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }),
    });
}

const workTitles: Record<'cloud_agent' | 'onboarding' | 'reminder' | 'trigger', string> = {
    cloud_agent: 'Cloud agent update',
    onboarding: 'Onboarding',
    reminder: 'Reminder',
    trigger: 'Trigger',
};

const failureReasons: Readonly<Record<string, string>> = {
    authentication: 'Needs sign-in',
    configuration: 'Configuration error',
    input: 'Invalid input',
    'rate-limit': 'Rate limited',
    'session-resume': 'Session could not resume',
    timeout: 'Timed out',
    transport: 'Connection lost',
};

const outcomeOrder: readonly AgentTurnOperationCategory[] = [
    'delegating',
    'generating_media',
    'editing_files',
    'running_command',
    'searching_web',
    'browsing',
    'reading_files',
    'using_tool',
    'updating_instructions',
    'checking_messages',
];

const outcomeNouns: Record<AgentTurnOperationCategory, readonly [string, string]> = {
    browsing: ['browser action', 'browser actions'],
    checking_messages: ['message check', 'message checks'],
    delegating: ['sub-agent', 'sub-agents'],
    editing_files: ['file edit', 'file edits'],
    generating_media: ['image or video', 'images or videos'],
    reading_files: ['file read', 'file reads'],
    running_command: ['command', 'commands'],
    searching_web: ['web search', 'web searches'],
    updating_instructions: ['instruction update', 'instruction updates'],
    using_tool: ['tool call', 'tool calls'],
};
