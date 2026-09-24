import type { MessageCause } from '@haus/api';
import { CursorHoverCard } from '../../../components/ui/cursor-hover-card.tsx';
import { cn } from '../../../lib/utils.ts';
import {
    ReferencePreviewHeader,
    ReferencePreviewText,
} from '../../mentions/reference-preview-header.tsx';
import { AutomationGlyph } from './automation-glyph.tsx';
import {
    automationMarkColor,
    messageCauseAttributionNote,
    messageCauseHoverFacts,
} from './automation-presentation.ts';

/**
 * Why an Agent spoke, in the message header between its name and the time.
 *
 * A fire writes nothing to the transcript, so this mark is the only chat-
 * visible trace of a Trigger or Reminder going off — and it has to say that
 * much in one glyph and a title, at the header line's scale, without reading
 * as a warning. Hovering it previews the automation from the message's own
 * `cause`; the fire's payload and history live in the Thread's context card.
 *
 * Title, glyph, and summary are snapshotted onto the message, so the mark
 * outlives the automation and reads the same after it is archived; only the
 * hover card's live facts go.
 */
export function MessageCauseMark({ cause }: { cause: MessageCause }) {
    return (
        <CursorHoverCard
            className="w-fit max-w-72"
            content={<MessageCauseHoverContent cause={cause} />}
            triggerClassName="min-w-0"
        >
            <span
                className={cn(
                    'inline-flex min-w-0 items-center gap-1 font-semibold text-xs leading-5',
                    automationMarkColor[cause.kind]
                )}
                data-testid="message-cause-mark"
            >
                <AutomationGlyph kind={cause.kind} />
                <span className="truncate">{cause.title}</span>
            </span>
        </CursorHoverCard>
    );
}

/**
 * The kind sits beside the title; reminder cadence sits below it.
 * one fact line carries status and history, and the standing instruction is
 * clipped to a glance. Managing the automation happens from the Agent's
 * Automations tab or the Thread context card, never from a hover.
 */
export function MessageCauseHoverContent({ cause }: { cause: MessageCause }) {
    const attributionNote = messageCauseAttributionNote(cause);
    const instruction = cause.live?.instruction;

    return (
        <ReferencePreviewHeader
            mark={
                <AutomationGlyph
                    className={automationMarkColor[cause.kind]}
                    kind={cause.kind}
                    size={16}
                />
            }
            meta={cause.kind === 'reminder' ? null : cause.summary}
            title={cause.title}
        >
            {cause.kind === 'reminder' ? (
                <ReferencePreviewText>{cause.summary}</ReferencePreviewText>
            ) : null}
            <ReferencePreviewText>{messageCauseHoverFacts(cause).join(' · ')}</ReferencePreviewText>
            {instruction ? (
                <ReferencePreviewText className="line-clamp-2" tone="foreground">
                    {instruction}
                </ReferencePreviewText>
            ) : null}
            {attributionNote ? (
                <ReferencePreviewText>{attributionNote}</ReferencePreviewText>
            ) : null}
        </ReferencePreviewHeader>
    );
}
