import type { AgentTurnOperationCategory, AgentTurnTrigger, Chat } from '@haus/api';
import type { TurnTriggerMessage } from '../../../hooks/members/use-turn-trigger-messages.ts';
import { messagePreviewLine } from '../../chats/message-preview-line.ts';
import { chatPlace } from '../../shell/tab-identity.ts';
import { formatAgentActivityEvent } from './agent-activity-model.ts';
import type { AgentActivityTurn } from './agent-activity-turns.ts';
import type { RecentActivityRow } from './recent-activity-rows.ts';

/**
 * What a turn row is titled by: the request that woke it. `text` is its first
 * line for the collapsed row and `request` the whole of it, line breaks kept,
 * for the open row. `pending` holds the title line blank while the message
 * reads; `none` means there is nothing the reader may see (private,
 * unrecorded, or unreadable), so the row is titled by what the turn did.
 */
export type TurnRowTitle =
    | { readonly kind: 'none' }
    | { readonly kind: 'pending'; readonly place: string | null }
    | {
          readonly kind: 'text';
          readonly place: string | null;
          readonly request: string;
          readonly text: string;
      };

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
        return text
            ? { kind: 'text', place, request: readRequest(read.message.content) || text, text }
            : { kind: 'none' };
    }
    const title = workTitles[trigger.kind];
    return { kind: 'text', place, request: title, text: title };
}

/**
 * What a turn did, in words, most telling first: `Ran 2 sub-agents · edited 3
 * files · read 4 · sent 1 message`. A noun the previous action already named
 * is not repeated. Failed or interrupted calls follow their count.
 */
export function formatTurnOutcome(turn: AgentActivityTurn): string {
    const actions = [...turn.operations]
        .sort(
            (left, right) =>
                outcomeOrder.indexOf(left.category) - outcomeOrder.indexOf(right.category)
        )
        .map((operation) => {
            const total = operation.completed + operation.failed + operation.interrupted;
            const exceptions = [
                operation.failed > 0 ? `${operation.failed} failed` : null,
                operation.interrupted > 0 ? `${operation.interrupted} interrupted` : null,
            ].filter(Boolean);
            return {
                ...outcomeAction(operation.category, total),
                suffix: exceptions.length > 0 ? ` (${exceptions.join(', ')})` : '',
            };
        });
    if (turn.messageCount > 0) {
        actions.push({ ...outcomeAction('sending_message', turn.messageCount), suffix: '' });
    }
    const parts = [
        // The row's status mark already says "Failed"; only a known reason adds anything.
        ...(turn.kind === 'settled' && turn.status === 'failed' && turn.failureKind
            ? [failureReasons[turn.failureKind]].filter((reason) => reason !== undefined)
            : []),
        ...actions.map((action, index) => {
            // `Searched the web` needs no count of one, and its `times` never carries over.
            if (action.isRepeat) {
                const count = action.count === 1 ? '' : ` ${action.count} ${action.noun}`;
                return `${action.verb}${count}${action.suffix}`;
            }
            const repeated = index > 0 && actions[index - 1]?.noun === action.noun;
            return `${action.verb} ${action.count}${repeated ? '' : ` ${action.noun}`}${action.suffix}`;
        }),
    ];
    if (parts.length > 0) {
        return parts.map((part, index) => (index === 0 ? part : lowerFirst(part))).join(' · ');
    }
    if (turn.kind === 'active') {
        // Nothing has settled yet: say what the Agent is doing right now.
        const latest = turn.events.at(-1);
        return latest ? formatAgentActivityEvent(latest) : 'Starting…';
    }
    // `outputProduced` is false here (no messages), so a completed turn is the
    // Agent's positive choice to stay quiet, not a lost run.
    return turn.status === 'completed' ? 'Stayed quiet' : 'Ended before any action';
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

/**
 * A length for a right-aligned numeric column, at most two units and no
 * zero padding, so it never outgrows the column: `<1s`, `42s`, `1m 24s`, `6m`,
 * `1h 2m`; `—` when the length is unknown. Turn rows and the hover card share it.
 */
export function formatTurnDuration(durationMs: number): string {
    if (!Number.isFinite(durationMs)) {
        return '—';
    }
    if (durationMs < 1000) {
        return '<1s';
    }
    const seconds = Math.round(durationMs / 1000);
    if (seconds < 60) {
        return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
        return joinUnits(minutes, 'm', seconds % 60, 's');
    }
    return joinUnits(Math.floor(minutes / 60), 'h', minutes % 60, 'm');
}

function joinUnits(major: number, majorUnit: string, minor: number, minorUnit: string) {
    return minor === 0 ? `${major}${majorUnit}` : `${major}${majorUnit} ${minor}${minorUnit}`;
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
    'generating_image',
    'generating_video',
    'editing_files',
    'running_command',
    'searching_web',
    'browsing',
    'reading_files',
    'using_tool',
    'updating_instructions',
    'checking_messages',
];

/** Verb, then the singular and plural noun its count takes. */
const outcomeWords: Record<
    AgentTurnOperationCategory | 'sending_message',
    readonly [string, string, string]
> = {
    browsing: ['Took', 'browser action', 'browser actions'],
    checking_messages: ['Checked messages', 'time', 'times'],
    delegating: ['Ran', 'sub-agent', 'sub-agents'],
    editing_files: ['Edited', 'file', 'files'],
    generating_image: ['Generated', 'image', 'images'],
    generating_video: ['Generated', 'video', 'videos'],
    reading_files: ['Read', 'file', 'files'],
    running_command: ['Ran', 'command', 'commands'],
    searching_web: ['Searched the web', 'time', 'times'],
    sending_message: ['Sent', 'message', 'messages'],
    updating_instructions: ['Updated instructions', 'time', 'times'],
    using_tool: ['Used', 'tool', 'tools'],
};

function outcomeAction(category: keyof typeof outcomeWords, count: number) {
    const [verb, one, many] = outcomeWords[category];
    return { count, isRepeat: one === 'time', noun: count === 1 ? one : many, verb };
}

/** A message's whole text as plain lines, one per paragraph it was written in. */
function readRequest(content: string): string {
    return content
        .split(/\n{2,}/u)
        .map((paragraph) => messagePreviewLine(paragraph))
        .filter(Boolean)
        .join('\n');
}

function lowerFirst(value: string): string {
    return value.charAt(0).toLowerCase() + value.slice(1);
}
