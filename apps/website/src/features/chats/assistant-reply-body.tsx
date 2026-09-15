import { splitVisualFences } from '@haus/api/widgets/visual';
import { useReducedMotion } from 'framer-motion';
import * as React from 'react';
import { ChatMarkdownText } from './chat-markdown-text.tsx';
import { useStreamingTextRanges } from './chat-streaming-text-ranges.ts';
import {
    ChatTranscriptMessageContent,
    getTranscriptMessageContent,
    renderTranscriptMessageAttachments,
    type TranscriptMessage,
} from './chat-transcript-message.tsx';
import { TranscriptMessageBlock } from './chat-transcript-message-block.tsx';
import { useTranscriptRenderContextOptional } from './chat-transcript-render-context.tsx';
import { useRevealedText } from './use-revealed-text.ts';
import { VisualCard } from './visual-card.tsx';

export function AssistantReplyBody(props: {
    animateEnter?: boolean;
    content?: string;
    message?: TranscriptMessage;
    revealKey?: string;
    revealText?: boolean;
    slotKey?: string | null;
}) {
    const context = useTranscriptRenderContextOptional();
    const { message } = props;
    const content = props.content ?? (message ? getTranscriptMessageContent(message) : '');
    const segments = splitVisualFences(content);
    const hasVisuals = segments.some((segment) => segment.kind === 'visual');
    const phase = message ? getAssistantMessagePhase(message) : null;
    const attachments = message
        ? context?.renderMessageAttachments
            ? context.renderMessageAttachments(message)
            : renderTranscriptMessageAttachments(message.attachments)
        : null;
    const slot =
        props.slotKey ??
        props.revealKey ??
        (message ? getAssistantMessageRevealKey(message) : 'reply');

    return (
        <TranscriptMessageBlock
            animateEnter={props.animateEnter ?? false}
            attachments={attachments}
            className={phase === 'commentary' ? 'opacity-85' : undefined}
            data-message-phase={phase ?? undefined}
            from="assistant"
        >
            <div className="chat-reply-segments">
                {hasVisuals ? (
                    segments.map((segment, index) => {
                        // Appending text or closing a fence must keep existing iframes mounted.
                        const key = `${slot}:${segment.kind}:${index}`;
                        if (segment.kind === 'visual') {
                            return (
                                <div className="max-w-[46rem]" key={key}>
                                    <VisualCard
                                        html={segment.html}
                                        open={segment.open}
                                        title={segment.title}
                                    />
                                </div>
                            );
                        }
                        if (!segment.text.trim()) {
                            return null;
                        }
                        return (
                            <AssistantReplyText
                                {...props}
                                content={segment.text.replace(/^\n+|\n+$/gu, '')}
                                key={key}
                                revealKey={key}
                                slotKey={key}
                            />
                        );
                    })
                ) : (
                    <AssistantReplyText {...props} />
                )}
            </div>
        </TranscriptMessageBlock>
    );
}

function AssistantReplyText({
    content,
    message,
    revealKey,
    revealText = false,
    slotKey = null,
}: {
    content?: string;
    message?: TranscriptMessage;
    revealKey?: string;
    revealText?: boolean;
    slotKey?: string | null;
}) {
    const fullContent = content ?? (message ? getTranscriptMessageContent(message) : '');
    const isCommentary = message && getAssistantMessagePhase(message) === 'commentary';
    const revealedText = useRevealedText(fullContent, {
        enabled: revealText,
        revealKey: revealKey ?? (message ? getAssistantMessageRevealKey(message) : 'assistant'),
    });
    const shouldReduceMotion = useReducedMotion();
    const context = useTranscriptRenderContextOptional();
    const animatedRanges = useStreamingTextRanges(revealedText, {
        enabled:
            shouldReduceMotion !== true && (revealText || revealedText.length < fullContent.length),
    });
    const ratchetRef = useRatchetedMinHeight(revealText, slotKey);
    const body = message ? (
        context?.renderMessageContent ? (
            context.renderMessageContent({ ...message, content: revealedText })
        ) : (
            <ChatTranscriptMessageContent
                animatedRanges={animatedRanges}
                contentOverride={revealedText}
                message={message}
                textClassName={isCommentary ? 'text-muted' : undefined}
            />
        )
    ) : (
        <ChatMarkdownText animatedRanges={animatedRanges} content={revealedText} />
    );

    return revealText ? (
        <div className="min-h-[1lh]" ref={ratchetRef}>
            {body}
        </div>
    ) : (
        body
    );
}

// Tallest height each live narration slot has reached, keyed by run. Module
// level on purpose: narration swaps can remount the slot, and the floor must
// survive the remount or the swap still shrinks the turn. Entries are a few
// bytes per run; the map is cleared when it grows past a session's worth.
const narrationSlotHeights = new Map<string, number>();
const maxTrackedNarrationSlots = 64;

// Latches the tallest height the live narration slot has reached and holds it
// as min-height, so replace-in-place text swaps never shrink the turn while
// it is running. The floor dies with the slot when the reply replaces it.
function useRatchetedMinHeight(enabled: boolean, slotKey: string | null) {
    const ref = React.useRef<HTMLDivElement | null>(null);

    React.useLayoutEffect(() => {
        if (!(enabled && slotKey && ref.current)) {
            return;
        }

        const floor = narrationSlotHeights.get(slotKey) ?? 0;
        const height = Math.max(ref.current.offsetHeight, floor);

        if (height > floor) {
            if (narrationSlotHeights.size >= maxTrackedNarrationSlots) {
                narrationSlotHeights.clear();
            }

            narrationSlotHeights.set(slotKey, height);
        }

        ref.current.style.minHeight = `${height}px`;
    });

    return ref;
}

function getAssistantMessagePhase(message: TranscriptMessage) {
    const runtime = message.metadata?.runtime;

    if (!(runtime && typeof runtime === 'object' && !Array.isArray(runtime))) {
        return null;
    }

    const phase = 'messagePhase' in runtime ? runtime.messagePhase : undefined;
    return phase === 'commentary' || phase === 'final_answer' ? phase : null;
}

function getAssistantMessageRevealKey(message: TranscriptMessage) {
    const runtime = message.metadata?.runtime;

    if (!(runtime && typeof runtime === 'object' && !Array.isArray(runtime))) {
        return message.id;
    }

    const runId = 'runId' in runtime ? runtime.runId : undefined;

    return typeof runId === 'string' && runId.trim().length > 0 ? runId : message.id;
}
