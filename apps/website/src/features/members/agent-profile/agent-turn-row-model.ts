import type { AgentTurnTrigger, Chat } from '@haus/api';
import { messagePreviewLine } from '../../chats/message-preview-line.ts';
import { chatPlace } from '../../shell/tab-identity.ts';
import { resolveRunMark, type TurnRunMark } from './agent-run-mark.ts';
import type { RecentActivityRow } from './recent-activity-rows.ts';

/**
 * What a turn row is titled by: the request that woke it, as its first line
 * (`text`). `pending` holds the title line blank while a running turn's trigger
 * reads; `none` means there is nothing the reader may see (private,
 * unrecorded, or a message that is gone), so the row is titled by what the
 * turn did.
 */
export type TurnRowTitle =
    | { readonly kind: 'none' }
    | { readonly kind: 'pending'; readonly place: string | null }
    | {
          readonly kind: 'text';
          readonly place: string | null;
          /** Background check-ins read muted, so they never outweigh real work. */
          readonly quiet?: boolean;
          /** A heartbeat or dream run: the Log's badge and outcome line. */
          readonly run?: TurnRunMark;
          readonly text: string;
      };

/**
 * A message or task trigger quotes its message (`preview`), so a title is never
 * a second read. `live` is a run still working: a heartbeat then reads
 * `Checking in` and a dream `Dreaming`; settled, `Checked in` (muted when it
 * had nothing to report) and `Dreamed`.
 */
export function resolveTurnRowTitle(
    trigger: AgentTurnTrigger | null,
    chats: ReadonlyMap<string, Pick<Chat, 'kind' | 'name'>>,
    live = false
): TurnRowTitle {
    if (!trigger || trigger.kind === 'private') {
        return { kind: 'none' };
    }
    // The nightly dream, heartbeats and their reports have no Chat, so no place.
    if (
        trigger.kind === 'dream' ||
        trigger.kind === 'heartbeat' ||
        trigger.kind === 'heartbeat_report'
    ) {
        return resolveRunTitle(trigger, chats, live);
    }
    const chat = chats.get(trigger.chatId);
    const place = chat ? chatPlace(chat) : null;
    if (trigger.kind === 'message' || trigger.kind === 'task') {
        const { preview } = trigger;
        if (!preview) {
            return { kind: 'none' };
        }
        const text =
            messagePreviewLine(preview.content) ||
            (preview.attachmentCount > 0 ? 'Attachment' : '');
        return text ? { kind: 'text', place, text } : { kind: 'none' };
    }
    const title = workTitles[trigger.kind];
    return { kind: 'text', place, text: title };
}

/** A dream, heartbeat, or heartbeat report: no Chat, so no place, but a badge and an outcome. */
function resolveRunTitle(
    trigger: Extract<AgentTurnTrigger, { kind: 'dream' | 'heartbeat' | 'heartbeat_report' }>,
    chats: ReadonlyMap<string, Pick<Chat, 'kind' | 'name'>>,
    live: boolean
): TurnRowTitle {
    const run = resolveRunMark(trigger, chats, live) ?? undefined;
    switch (trigger.kind) {
        case 'dream':
            return { kind: 'text', place: null, run, text: live ? 'Dreaming' : 'Dreamed' };
        case 'heartbeat': {
            // A heartbeat that sent a report is news, so it reads at normal emphasis.
            const quiet = live || (trigger.report === null && !trigger.yielded);
            return {
                kind: 'text',
                place: null,
                quiet,
                run,
                text: live ? 'Checking in' : 'Checked in',
            };
        }
        case 'heartbeat_report':
            return { kind: 'text', place: null, run, text: 'Heartbeat report' };
    }
}

/**
 * The open row's way back to its Chat: `View in #product`. A DM is always a
 * person and this Agent, so it names the Agent (`View in DM with Tiny`), where
 * the title's muted place stays a bare `DM`.
 */
export function turnChatActionLabel(place: string, agentName: string): string {
    return place === dmPlace ? `View in DM with ${agentName}` : `View in ${place}`;
}

const dmPlace = chatPlace({ kind: 'dm', name: null });

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

export function localDayKey(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function formatDayLabel(date: Date, now: number): string {
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
