import type { AutomationFireContext, MessageCause, MessageCauseLive } from '@haus/api';
import { formatRelativeTime, formatTimestamp } from '../../../lib/format.ts';
import { formatTriggerPayloadSize } from '../../members/agent-profile/agent-trigger-model.ts';

/**
 * How a caused message presents its provenance: the header mark, its hover
 * card, and the Thread context card all read from here, so a Trigger and a
 * Reminder are told apart in one place rather than at three call sites.
 */

export type AutomationKind = MessageCause['kind'];

/** The mark's ink. One token per automation, resolved through Tailwind. */
export const automationMarkColor = {
    reminder: 'text-reminder-mark',
    trigger: 'text-trigger-mark',
} as const satisfies Record<AutomationKind, string>;

/**
 * A status is a resting state someone chose, not a failure, so only `armed`
 * and `scheduled` carry colour — the inert states stay neutral rather than
 * borrowing `danger` and reading as breakage.
 */
export function automationStatusChip(status: MessageCauseLive['status']): {
    color: 'accent' | 'default' | 'success';
    label: string;
} {
    switch (status) {
        case 'armed':
            return { color: 'success', label: 'Armed' };
        case 'scheduled':
            return { color: 'accent', label: 'Scheduled' };
        case 'fired':
            return { color: 'default', label: 'Fired' };
        case 'canceled':
            return { color: 'default', label: 'Canceled' };
        default:
            return { color: 'default', label: 'Disabled' };
    }
}

/**
 * The hover card's fact line, built from the message alone — the cause rides
 * every message the Server hands a client, so previewing an automation costs
 * no second read. The kind or cadence is the header's `·` clause, so it is not
 * repeated here: `Armed · Last fired 4m ago · 12 fires` for a Trigger,
 * `Scheduled · Last fired 2h ago` for a Reminder.
 *
 * Once the automation is archived there is no live record to read, so the line
 * falls back to what the message snapshotted: that it is gone, and the fire
 * this message answered. Standing in that fire for "Last fired" keeps the card
 * to one representation of each fact rather than showing a stale live one.
 */
export function messageCauseHoverFacts(cause: MessageCause, now = Date.now()): string[] {
    if (!cause.live) {
        return ['Archived', `Fired ${formatRelativeTime(cause.firedAt, now)}`];
    }

    const facts = [
        automationStatusChip(cause.live.status).label,
        cause.live.lastFiredAt
            ? `Last fired ${formatRelativeTime(cause.live.lastFiredAt, now)}`
            : 'Never fired',
    ];

    if (cause.kind === 'trigger') {
        const count = cause.live.fireCount;
        facts.push(`${count} ${count === 1 ? 'fire' : 'fires'}`);
    }

    return facts;
}

/**
 * Says the automation itself is gone. The Server keeps a fired one-shot
 * reminder and an old fire for 30 days, so a mark outlives its record; the
 * provenance surfaces still answer "why did this arrive" from the snapshot and
 * this line explains why they say no more than that.
 */
export function messageCauseArchivedNote(cause: MessageCause): string | null {
    if (cause.live) {
        return null;
    }

    return cause.kind === 'reminder'
        ? 'This reminder has been archived.'
        : 'This trigger has been archived.';
}

/**
 * Says so when the link between the message and the fire is the Server's own
 * conclusion rather than the Agent's claim: the fire was the only thing that
 * run was offered and the message landed in its anchor Chat. An explicit
 * `--cause` needs no note — an unqualified mark already means the Agent said
 * so — so only the inferred case carries one.
 */
export function messageCauseAttributionNote(cause: MessageCause): string | null {
    return cause.attribution === 'inferred' ? 'Attributed by Haus, not named by the Agent.' : null;
}

/**
 * One fact of the context card's meta line. `value` is the part that carries
 * the information and is inked in the foreground; the muted words around it
 * only say what it means.
 */
export interface AutomationMetaPart {
    prefix?: string;
    suffix?: string;
    value: string;
}

/**
 * `Webhook · Fired 4m ago · fire 12 of 12` for a Trigger,
 * `Every Monday at 09:00 · Next Mon 9:00 AM` for a Reminder.
 */
export function fireContextMetaParts(
    context: AutomationFireContext,
    now = Date.now()
): AutomationMetaPart[] {
    const fired: AutomationMetaPart = {
        prefix: 'Fired',
        value: formatRelativeTime(context.firedAt, now),
    };

    // Archived: the cadence and the history are gone with the record, so the
    // card states the two things the message still remembers.
    if (!context.cause.live) {
        return [{ value: context.cause.summary }, fired];
    }

    if (context.cause.kind === 'reminder') {
        const parts: AutomationMetaPart[] = [{ value: context.repeat ?? context.cause.summary }];
        if (context.nextFireAt) {
            parts.push({ prefix: 'Next', value: formatUpcomingTime(context.nextFireAt) });
        }
        return parts;
    }

    const parts: AutomationMetaPart[] = [{ value: context.cause.summary }, fired];
    if (context.fireOrdinal !== null && context.fireTotal !== null) {
        parts.push({
            prefix: 'fire',
            suffix: `of ${context.fireTotal}`,
            value: String(context.fireOrdinal),
        });
    }
    return parts;
}

/**
 * The payload disclosure's summary. Bytes are the sender's, not the excerpt's,
 * so a truncated excerpt still reports what actually arrived.
 */
export function fireContextPayloadLabel(context: AutomationFireContext): string | null {
    if (context.payload === null || context.payloadBytes === null) {
        return null;
    }

    const parts = ['Payload', formatTriggerPayloadSize(context.payloadBytes)];
    if (context.contentType) {
        parts.push(context.contentType);
    }
    return parts.join(' · ');
}

/**
 * Shiki's id for the excerpt. A sender's content type is a full media type
 * with parameters, so match on what it starts with rather than on equality;
 * anything unrecognized renders as plain text rather than mis-highlighted.
 */
export function fireContextPayloadLanguage(contentType: string | null): string {
    const media = (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
    if (media.endsWith('/json') || media.endsWith('+json')) {
        return 'json';
    }
    if (media === 'text/html' || media.endsWith('/xml') || media.endsWith('+xml')) {
        return 'xml';
    }
    return 'plaintext';
}

/** The message a Reminder was set from, quoted the way the hover card quotes it. */
export function fireContextAnchorNote(context: AutomationFireContext): string | null {
    return context.anchorExcerpt ? `Anchored on: “${context.anchorExcerpt}”` : null;
}

/**
 * A time that has not happened yet reads by weekday, not by date: "Mon 9:00 AM"
 * is what someone would say about the next fire, where "Sep 7, 9:00 AM" makes
 * them count days. Past a week the weekday stops being enough and the calendar
 * date takes over.
 */
export function formatUpcomingTime(value: string, now = Date.now()): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    if (date.getTime() - now > sevenDaysMs) {
        return formatTimestamp(value);
    }
    return new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        weekday: 'short',
    }).format(date);
}

const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
