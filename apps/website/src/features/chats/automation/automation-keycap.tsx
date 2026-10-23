import type { MessageCause } from '@haus/api';
import { FlashIcon } from '@hugeicons-pro/core-solid-rounded';
import { identityMarkRadius } from '../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../components/ui/icon.tsx';

/**
 * What a keycap prints. A Reminder is a calendar page — a rose band across the
 * top over an hour — and a Trigger is a key that got pressed: a glyph in the
 * trigger ink on a neutral face, the bolt unless a surface names the source.
 */
export type AutomationKeycapMark =
    | { hour: string; kind: 'reminder' }
    | { icon?: Parameters<typeof Icon>[0]['icon']; kind: 'trigger' };

/**
 * An automation's raised key at the exact box a surface gives it: 20px where it
 * stands for an author on a context line, 24px on the Thread context card. The
 * face, edge, highlight, and lip are theme tokens, so the key lifts off the
 * canvas in dark and sits on it in light. Exact box, so it derives its radius
 * the way every other fixed identity mark in the app does.
 */
export function AutomationKeycap({ mark, size }: { mark: AutomationKeycapMark; size: number }) {
    return (
        <span
            aria-hidden="true"
            className="bg-(image:--automation-keycap-face) flex shrink-0 flex-col overflow-hidden shadow-(--automation-keycap-shadow)"
            data-automation-keycap={mark.kind}
            style={{ borderRadius: identityMarkRadius(size), height: size, width: size }}
        >
            <AutomationKeycapFace mark={mark} size={size} />
        </span>
    );
}

/**
 * What sits on the key, scaled to its box, for a surface whose own slot is the
 * key (the Automations list's ItemCard icon, keyed in `default-theme.css`).
 * The band, numeral, and glyph hold the 20px key's proportions at every size.
 */
export function AutomationKeycapFace({ mark, size }: { mark: AutomationKeycapMark; size: number }) {
    const inset = { paddingBottom: size * 0.1 };
    if (mark.kind === 'reminder') {
        return (
            <>
                <span
                    className="w-full shrink-0 bg-reminder-mark"
                    style={{ height: size * 0.275 }}
                />
                <span
                    className="grid w-full flex-1 place-items-center font-bold text-foreground tabular-nums leading-none tracking-tight"
                    style={{ ...inset, fontSize: size * 0.6 }}
                >
                    {mark.hour}
                </span>
            </>
        );
    }
    const glyph = Math.round(size * 0.55);
    return (
        <span
            className="grid w-full flex-1 place-items-center text-automation-keycap-ink-trigger"
            style={inset}
        >
            <Icon
                icon={mark.icon ?? FlashIcon}
                size={glyph}
                style={{ height: glyph, width: glyph }}
            />
        </span>
    );
}

/** An instant's hour on a 12-hour clock: "9" for 9:04 am. */
export function keycapHour(value: string, timeZone?: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    return (
        new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: true, timeZone })
            .formatToParts(date)
            .find((part) => part.type === 'hour')?.value ?? ''
    );
}

/** A cause's key: a Reminder shows the hour it fired, a Trigger the bolt. */
export function causeKeycapMark(
    cause: Pick<MessageCause, 'firedAt' | 'kind'>
): AutomationKeycapMark {
    return cause.kind === 'reminder'
        ? { hour: keycapHour(cause.firedAt), kind: 'reminder' }
        : { kind: 'trigger' };
}
