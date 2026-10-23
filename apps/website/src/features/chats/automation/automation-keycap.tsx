import type { MessageCause } from '@haus/api';
import { FlashIcon } from '@hugeicons-pro/core-solid-rounded';
import { identityMarkRadius } from '../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { turnContextMarkSize } from '../turn-context-line.tsx';

/**
 * The 20px raised key a cause line leads with, standing where a reply line
 * shows its parent's author. Both kinds share the key; what is printed on it
 * tells them apart. A Reminder is a calendar page — a rose band across the
 * top over the hour it fired — and a Trigger is a key that got pressed, a
 * bolt in the trigger ink on a neutral face.
 *
 * The face, edge, highlight, and lip are theme tokens, so the key lifts off
 * the canvas in dark and sits on it in light. Exact box, so it derives its
 * radius the way every other fixed identity mark in the app does.
 */
export function AutomationKeycap({ cause }: { cause: Pick<MessageCause, 'firedAt' | 'kind'> }) {
    return (
        <span
            aria-hidden="true"
            className="bg-(image:--automation-keycap-face) flex shrink-0 flex-col overflow-hidden shadow-(--automation-keycap-shadow)"
            data-automation-keycap={cause.kind}
            style={{
                borderRadius: identityMarkRadius(turnContextMarkSize),
                height: turnContextMarkSize,
                width: turnContextMarkSize,
            }}
        >
            {cause.kind === 'reminder' ? (
                <>
                    <span className="h-[5.5px] shrink-0 bg-reminder-mark" />
                    <span className="grid flex-1 place-items-center pb-[2px] font-bold text-[12px] text-foreground tabular-nums leading-none tracking-tight">
                        {firedHour(cause.firedAt)}
                    </span>
                </>
            ) : (
                <span className="grid flex-1 place-items-center pb-[2px] text-automation-keycap-ink-trigger">
                    <Icon icon={FlashIcon} size={11} style={{ height: 11, width: 11 }} />
                </span>
            )}
        </span>
    );
}

/** The fire's hour on a 12-hour clock in the viewer's zone: "9" for 9:04 am. */
export function firedHour(firedAt: string): string {
    const date = new Date(firedAt);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    return (
        new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: true })
            .formatToParts(date)
            .find((part) => part.type === 'hour')?.value ?? ''
    );
}
