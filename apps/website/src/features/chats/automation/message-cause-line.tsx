import type { MessageCause } from '@haus/api';
import { CursorHoverCard } from '../../../components/ui/cursor-hover-card.tsx';
import { cn } from '../../../lib/utils.ts';
import { AgentProfileLink } from '../../members/agent-profile-link.tsx';
import {
    ReferencePreviewHeader,
    ReferencePreviewText,
} from '../../mentions/reference-preview-header.tsx';
import { TurnContextLine, turnContextLineContentClassName } from '../turn-context-line.tsx';
import { AutomationGlyph, AutomationGlyphBox } from './automation-glyph.tsx';
import {
    automationMarkColor,
    automationMarkElbow,
    messageCauseAttributionNote,
    messageCauseHoverFacts,
} from './automation-presentation.ts';

/**
 * Why an Agent spoke, on a context line above its message — the same line a
 * reply's parent takes, so a fire reads as what the message answers.
 *
 * A fire writes nothing to the transcript, so this line is the only chat-
 * visible trace of a Trigger or Reminder going off. The glyph stands where a
 * reply shows its parent's author, and the title fills the rest of the line.
 * Hovering previews the automation from the message's own `cause`; pressing
 * opens the owning Agent's Automations tab, the one place it is managed.
 *
 * Title, glyph, and summary are snapshotted onto the message, so the line
 * outlives the automation and reads the same after it is archived; only the
 * hover card's live facts and the way into Automations go.
 */
export function MessageCauseLine({ cause }: { cause: MessageCause }) {
    const className = cn(
        turnContextLineContentClassName,
        'max-w-full font-medium',
        automationMarkColor[cause.kind]
    );
    const content = (
        <>
            <AutomationGlyphBox kind={cause.kind} variant="avatar" />
            <span className="min-w-0 truncate">{cause.title}</span>
        </>
    );

    return (
        <TurnContextLine elbowClassName={automationMarkElbow[cause.kind]}>
            <CursorHoverCard
                className="w-fit max-w-72"
                content={<MessageCauseHoverContent cause={cause} />}
                triggerClassName="flex min-w-0 max-w-full"
            >
                {cause.live ? (
                    <AgentProfileLink
                        agentId={cause.ownerAgentId}
                        aria-label={`Open ${automationNoun[cause.kind]}: ${cause.title}`}
                        className={cn(className, 'cursor-(--cursor-interactive) hover:underline')}
                        data-testid="message-cause-line"
                        section="automations"
                    >
                        {content}
                    </AgentProfileLink>
                ) : (
                    <span className={className} data-testid="message-cause-line">
                        {content}
                    </span>
                )}
            </CursorHoverCard>
        </TurnContextLine>
    );
}

const automationNoun = {
    reminder: 'reminder',
    trigger: 'trigger',
} as const satisfies Record<MessageCause['kind'], string>;

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
