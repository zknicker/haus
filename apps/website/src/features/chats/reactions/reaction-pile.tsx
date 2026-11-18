import * as React from 'react';
import { freshReactions, usePendingOwnReactions } from '../../../hooks/servers/fresh-reactions.ts';
import {
    type TranscriptMessageRow,
    useTranscriptRenderContextOptional,
} from '../chat-transcript-render-context.tsx';
import { ReactionOverflowChip } from './reaction-overflow-chip.tsx';
import { buildReactionPile, pileWidths } from './reaction-pile-model.ts';
import { ReactionSticker } from './reaction-sticker.tsx';
import { useReactionStamps } from './use-reaction-stamps.ts';

/**
 * A message's reactions as a pile of stickers on their own row under the
 * message body, left-aligned with the text. Every chatter's reactions render
 * here, human or Agent. The pile fans out on hover or focus.
 */
export function ReactionPile({ row }: { row: TranscriptMessageRow }) {
    const context = useTranscriptRenderContextOptional();
    const toggle = context?.onToggleReaction;
    const viewerUserId = context?.viewerUserId;
    const messageId = row.message.id;
    const reactions = row.message.reactions ?? emptyReactions;
    const pending = usePendingOwnReactions(messageId);
    const pile = React.useMemo(
        () => buildReactionPile({ pending, reactions, viewerUserId }),
        [pending, reactions, viewerUserId]
    );
    const pileRef = React.useRef<HTMLDivElement>(null);
    const filterId = `diecut${React.useId().replace(/[^\w-]/g, '')}`;
    const slots = pile.stickers.length + (pile.overflow.length > 0 ? 1 : 0);
    const stamps = useReactionStamps(messageId, pile, pileRef);

    React.useEffect(() => {
        // The Server's copy has landed; the pending own add has done its job.
        for (const emoji of pending) {
            const confirmed = reactions.some(
                (reaction) =>
                    reaction.emoji === emoji &&
                    reaction.actors.some((actor) => actor.id === viewerUserId)
            );
            if (confirmed) {
                freshReactions.dropPending(messageId, emoji);
            }
        }
    }, [messageId, pending, reactions, viewerUserId]);

    if (slots === 0) {
        return null;
    }

    const widths = pileWidths(slots);

    return (
        <div className="reaction-row">
            <div
                className="reaction-pile"
                ref={pileRef}
                style={
                    {
                        '--diecut': `url(#${filterId})`,
                        '--fan-width': `${widths.fan}px`,
                        '--rest-width': `${widths.rest}px`,
                    } as React.CSSProperties
                }
            >
                <DiecutFilter id={filterId} />
                {pile.stickers.map((sticker, index) => (
                    <ReactionSticker
                        index={index}
                        key={sticker.key}
                        messageId={messageId}
                        onToggle={
                            toggle
                                ? () =>
                                      toggle({
                                          emoji: sticker.emoji,
                                          messageId,
                                          remove: sticker.own,
                                      })
                                : undefined
                        }
                        stamp={stamps.get(sticker.key)}
                        sticker={sticker}
                    />
                ))}
                {pile.overflow.length > 0 ? (
                    <ReactionOverflowChip entries={pile.overflow} index={pile.stickers.length} />
                ) : null}
            </div>
        </div>
    );
}

const emptyReactions: NonNullable<TranscriptMessageRow['message']['reactions']> = [];

/**
 * A round-brush die-cut outline: blur the glyph's alpha, threshold it back to
 * a hard edge, fill it with the theme's die-cut color (`--reaction-diecut`),
 * then lay a soft, close shadow under it. Dilation would square off pointed
 * tips and stacked drop-shadows would stair-step.
 */
function DiecutFilter({ id }: { id: string }) {
    return (
        <svg aria-hidden="true" className="reaction-pile__defs" height="0" width="0">
            <filter
                colorInterpolationFilters="sRGB"
                height="120%"
                id={id}
                width="120%"
                x="-10%"
                y="-10%"
            >
                <feGaussianBlur in="SourceAlpha" result="grow" stdDeviation="8" />
                <feComponentTransfer in="grow" result="edge">
                    <feFuncA intercept="-0.35" slope="16" type="linear" />
                </feComponentTransfer>
                <feFlood style={{ floodColor: 'var(--reaction-diecut)' }} />
                <feComposite in2="edge" operator="in" result="cut" />
                <feGaussianBlur in="edge" result="sb" stdDeviation="5" />
                <feOffset dy="5" in="sb" result="so" />
                <feComponentTransfer in="so" result="shadow">
                    <feFuncA slope=".12" type="linear" />
                </feComponentTransfer>
                <feMerge>
                    <feMergeNode in="shadow" />
                    <feMergeNode in="cut" />
                    <feMergeNode in="SourceGraphic" />
                </feMerge>
            </filter>
        </svg>
    );
}
